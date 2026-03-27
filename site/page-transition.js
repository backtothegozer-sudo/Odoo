(function () {
  var duration = 280;
  var scrollGap = 12;
  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var audioCtx = null;

  function initFixedHeaderOffset() {
    var header = document.querySelector("header");
    if (!header) return;
    document.body.classList.add("has-fixed-header");

    function syncHeaderHeight() {
      var h = Math.ceil(header.getBoundingClientRect().height) || 84;
      document.documentElement.style.setProperty("--fixed-header-h", h + "px");
      document.documentElement.style.setProperty("--mobile-header-h", h + "px");
    }

    syncHeaderHeight();
    window.addEventListener("resize", syncHeaderHeight);
    if (window.ResizeObserver) {
      new ResizeObserver(syncHeaderHeight).observe(header);
    }
  }

  function isDesktopInvaderMode() {
    return window.matchMedia("(min-width: 901px)").matches &&
      window.matchMedia("(hover: hover)").matches &&
      window.matchMedia("(pointer: fine)").matches;
  }

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
      ".lang-switch{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:140;display:inline-flex;align-items:center;gap:6px;padding:4px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(10,10,14,.62);backdrop-filter:blur(8px);}",
      ".lang-switch button{border:0;background:transparent;color:rgba(235,236,242,.78);font-size:11px;letter-spacing:.06em;padding:6px 9px;border-radius:999px;cursor:pointer;}",
      ".lang-switch button.is-active{color:#fff;background:linear-gradient(135deg, rgba(230,75,255,.42), rgba(75,91,255,.42));}",
      "@media (max-width:900px){.lang-switch{bottom:calc(12px + env(safe-area-inset-bottom));z-index:150;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function initLanguageRouting() {
    var path = window.location.pathname || "/";
    if (/google[0-9a-z]+\.html$/i.test(path)) return false;

    var key = "underside_lang_pref";
    var current = currentLangFromPath(path);
    var saved = "";
    try {
      saved = window.localStorage.getItem(key) || "";
    } catch (err) {
      saved = "";
    }
    var detected = /^en/i.test(navigator.language || "") ? "en" : "fr";
    var target = "";

    // 1) Respect explicit user preference everywhere.
    if (saved === "fr" || saved === "en") {
      target = saved;
    } else {
      // 2) No stored choice: use browser language only on home entrypoints.
      var isRootEntry = false;
      if (window.location.protocol === "file:") {
        isRootEntry = /\/site\/(en\/)?index\.html$/i.test(path);
      } else {
        isRootEntry = path === "/" || path === "/index.html" || path === "/en" || path === "/en/" || path === "/en/index.html";
      }
      if (!isRootEntry) return false;
      target = detected;
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
    if (document.querySelector(".lang-switch")) return;

    var key = "underside_lang_pref";
    var current = currentLangFromPath(path);
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
    (document.body || document.documentElement).appendChild(wrap);
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

  function playSynthFx(opts) {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    var duration = Math.max(0.04, opts.duration || 0.1);
    var startFreq = Math.max(40, opts.freq || 440);
    var endFreq = Math.max(40, opts.freqEnd || startFreq);
    var peak = Math.max(0.008, Math.min(0.22, opts.peak || 0.05));
    var attack = Math.min(duration * 0.45, 0.02);
    var releaseStart = Math.max(0.002, duration - 0.02);
    var t0 = ctx.currentTime + (opts.delay || 0);
    var t1 = t0 + duration;

    var osc = ctx.createOscillator();
    var gain = ctx.createGain();

    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(startFreq, t0);
    if (Math.abs(endFreq - startFreq) > 0.1) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, t1);
    }
    if (typeof opts.detune === "number") {
      osc.detune.setValueAtTime(opts.detune, t0);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(peak * 0.55, t0 + releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    if (opts.filterType) {
      var filter = ctx.createBiquadFilter();
      filter.type = opts.filterType;
      filter.frequency.setValueAtTime(opts.filterFreq || 1200, t0);
      if (typeof opts.filterQ === "number") {
        filter.Q.setValueAtTime(opts.filterQ, t0);
      }
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.03);
  }

  function playPlayerShootSound() {
    playSynthFx({
      type: "square",
      freq: 950,
      freqEnd: 330,
      duration: 0.075,
      peak: 0.036,
      filterType: "lowpass",
      filterFreq: 2100,
      filterQ: 0.9,
    });
  }

  function playEnemyShootSound() {
    playSynthFx({
      type: "triangle",
      freq: 420,
      freqEnd: 210,
      duration: 0.11,
      peak: 0.024,
      filterType: "bandpass",
      filterFreq: 820,
      filterQ: 1.5,
    });
  }

  function playInvaderHitSound() {
    playSynthFx({
      type: "sawtooth",
      freq: 760,
      freqEnd: 240,
      duration: 0.11,
      peak: 0.05,
      filterType: "lowpass",
      filterFreq: 1700,
      filterQ: 0.8,
    });
    playSynthFx({
      type: "triangle",
      freq: 540,
      freqEnd: 320,
      duration: 0.08,
      delay: 0.01,
      peak: 0.03,
      filterType: "highpass",
      filterFreq: 480,
      filterQ: 0.8,
    });
  }

  function playPlayerHitSound() {
    playSynthFx({
      type: "square",
      freq: 210,
      freqEnd: 95,
      duration: 0.2,
      peak: 0.065,
      filterType: "lowpass",
      filterFreq: 720,
      filterQ: 0.9,
    });
    playSynthFx({
      type: "triangle",
      freq: 285,
      freqEnd: 130,
      duration: 0.16,
      delay: 0.025,
      peak: 0.04,
      filterType: "bandpass",
      filterFreq: 650,
      filterQ: 1.1,
    });
  }

  function playLevelUpSound() {
    var notes = [392.0, 523.25, 659.25];
    for (var i = 0; i < notes.length; i++) {
      playSynthFx({
        type: "triangle",
        freq: notes[i],
        freqEnd: notes[i] * 1.02,
        duration: 0.12,
        delay: i * 0.09,
        peak: 0.04,
        filterType: "lowpass",
        filterFreq: 1900,
        filterQ: 0.75,
      });
    }
  }

  function playGameOverSound() {
    var notes = [330.0, 247.0, 196.0, 147.0];
    for (var i = 0; i < notes.length; i++) {
      playSynthFx({
        type: "square",
        freq: notes[i],
        freqEnd: notes[i] * 0.92,
        duration: 0.18,
        delay: i * 0.13,
        peak: 0.045,
        filterType: "lowpass",
        filterFreq: 920,
        filterQ: 0.85,
      });
    }
  }

  function playSaucerHitSound() {
    playSynthFx({
      type: "sawtooth",
      freq: 1020,
      freqEnd: 380,
      duration: 0.16,
      peak: 0.06,
      filterType: "bandpass",
      filterFreq: 1450,
      filterQ: 1.0,
    });
    playSynthFx({
      type: "triangle",
      freq: 710,
      freqEnd: 260,
      duration: 0.13,
      delay: 0.03,
      peak: 0.04,
      filterType: "highpass",
      filterFreq: 520,
      filterQ: 0.85,
    });
  }

  function playSaucerSpawnSound() {
    playSynthFx({
      type: "triangle",
      freq: 430,
      freqEnd: 560,
      duration: 0.14,
      peak: 0.026,
      filterType: "bandpass",
      filterFreq: 980,
      filterQ: 1.15,
    });
    playSynthFx({
      type: "sine",
      freq: 570,
      freqEnd: 700,
      duration: 0.11,
      delay: 0.03,
      peak: 0.018,
      filterType: "highpass",
      filterFreq: 420,
      filterQ: 0.8,
    });
  }

  function playAuraBonusSound() {
    playSynthFx({
      type: "square",
      freq: 880,
      freqEnd: 620,
      duration: 0.12,
      peak: 0.05,
      filterType: "bandpass",
      filterFreq: 1300,
      filterQ: 1.2,
    });
    playSynthFx({
      type: "triangle",
      freq: 1320,
      freqEnd: 920,
      duration: 0.1,
      delay: 0.03,
      peak: 0.035,
      filterType: "highpass",
      filterFreq: 650,
      filterQ: 0.9,
    });
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

  function initDesktopSpaceInvaders() {
    var launcher = null;
    var overlay = null;
    var canvas = null;
    var ctx = null;
    var statsNode = null;
    var boardBodyNode = null;
    var closeNode = null;
    var isOpen = false;
    var rafId = 0;
    var titleReturnTimer = 0;
    var lastFrameTs = 0;
    var dpr = 1;
    var keys = { left: false, right: false, shoot: false };
    var state = null;
    var highScoreStoreKey = "underside_invader_highscores_v1";
    var highScores = [];
    var dateFormatter = null;
    var saucerBonusPoints = 1000;
    var auraBonusPoints = 120;
    var titleSwapDelay = 6.5;
    var blockedNameExact = [
      "FDP",
      "FUCK",
      "SHIT",
      "BITCH",
      "MERDE",
      "PUTE",
      "CON",
      "CUL",
      "SEXE",
      "ANUS",
      "PENIS",
      "ENCUL",
      "NAZI"
    ];
    var blockedNameFragments = [
      "FUCK",
      "SHIT",
      "BITCH",
      "MERD",
      "PUTE",
      "ENCUL",
      "FDP"
    ];

    function worldWidth() {
      return canvas ? canvas.width / dpr : 0;
    }

    function worldHeight() {
      return canvas ? canvas.height / dpr : 0;
    }

    function clearTitleReturnTimer() {
      if (!titleReturnTimer) return;
      window.clearTimeout(titleReturnTimer);
      titleReturnTimer = 0;
    }

    function scheduleReturnToTitle(delayMs) {
      clearTitleReturnTimer();
      var wait = typeof delayMs === "number" ? Math.max(300, delayMs) : 1300;
      titleReturnTimer = window.setTimeout(function () {
        titleReturnTimer = 0;
        if (!isOpen || !state || state.mode !== "name_entry" || !state.nameEntrySubmitted) return;
        startTitleScreen();
      }, wait);
    }

    function refreshDesktopAvailability() {
      if (!launcher) return;
      var isDesktop = isDesktopInvaderMode();
      launcher.classList.toggle("is-hidden", !isDesktop);
      if (!isDesktop && isOpen) {
        closeGame();
      }
    }

    function placePlayer() {
      if (!state) return;
      var w = worldWidth();
      var h = worldHeight();
      state.player.x = (w - state.player.w) / 2;
      state.player.y = h - 52;
    }

    function resizeCanvas() {
      if (!canvas || !ctx) return;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      placePlayer();
    }

    function resetSaucerCycle(firstPass) {
      if (!state) return;
      state.nextSaucerIn = firstPass
        ? 0.8 + Math.random() * 0.9
        : 4.0 + Math.random() * 3.5;
    }

    function clearAuraInvader() {
      if (!state) return;
      state.auraInvader = null;
      state.auraTimer = 0;
    }

    function resetAuraCycle(firstPass) {
      if (!state) return;
      clearAuraInvader();
      state.nextAuraIn = firstPass
        ? 2.4 + Math.random() * 2.6
        : 4.6 + Math.random() * 4.4;
    }

    function updateAuraInvader(dt, aliveInvaders) {
      if (!state) return;
      if (!aliveInvaders || !aliveInvaders.length) {
        clearAuraInvader();
        return;
      }

      var auraTarget = state.auraInvader;
      if (auraTarget && (!auraTarget.alive || aliveInvaders.indexOf(auraTarget) === -1)) {
        clearAuraInvader();
        state.nextAuraIn = 2.0 + Math.random() * 2.4;
      }

      if (state.auraInvader) {
        state.auraTimer = Math.max(0, state.auraTimer - dt);
        if (state.auraTimer <= 0) {
          clearAuraInvader();
          state.nextAuraIn = 4.2 + Math.random() * 4.8;
        }
        return;
      }

      state.nextAuraIn -= dt;
      if (state.nextAuraIn > 0) return;

      var shouldSpawnAura = Math.random() < 0.66;
      if (!shouldSpawnAura) {
        state.nextAuraIn = 1.8 + Math.random() * 2.8;
        return;
      }

      state.auraInvader = aliveInvaders[Math.floor(Math.random() * aliveInvaders.length)];
      state.auraTimer = 2.8 + Math.random() * 2.2;
    }

    function spawnSaucer() {
      if (!state) return;
      var w = worldWidth() || 960;
      var fromLeft = Math.random() < 0.5;
      var width = 58;
      var height = 22;
      var speed = 92 + Math.random() * 28 + Math.min(18, state.level * 3);
      state.saucer = {
        active: true,
        x: fromLeft ? -width - 16 : w + 16,
        y: 96 + Math.random() * 44,
        w: width,
        h: height,
        vx: fromLeft ? speed : -speed,
      };
      playSaucerSpawnSound();
    }

    function updateSaucer(dt) {
      if (!state || !state.saucer) return;
      var w = worldWidth();
      if (state.saucer.active) {
        state.saucer.x += state.saucer.vx * dt;
        if (state.saucer.x + state.saucer.w < -20 || state.saucer.x > w + 20) {
          state.saucer.active = false;
          resetSaucerCycle(false);
        }
        return;
      }
      state.nextSaucerIn -= dt;
      if (state.nextSaucerIn <= 0) {
        spawnSaucer();
      }
    }

    function spawnInvaders() {
      var w = worldWidth();
      var cols = 7;
      var rows = Math.min(4, 3 + Math.floor((state.level - 1) / 3));
      var invW = 34;
      var invH = 24;
      var gapX = 18;
      var gapY = 16;
      var fleetW = cols * invW + (cols - 1) * gapX;
      var startX = Math.max(16, Math.floor((w - fleetW) / 2));
      var startY = 64;
      state.invaders = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          state.invaders.push({
            x: startX + c * (invW + gapX),
            y: startY + r * (invH + gapY),
            w: invW,
            h: invH,
            row: r,
            col: c,
            alive: true,
          });
        }
      }
      state.invaderDir = 1;
      state.invaderSpeed = Math.min(140, 36 + state.level * 11);
      state.enemyShootCooldown = Math.max(0.2, 1.0 - state.level * 0.06);
    }

    function sanitizePlayerName(raw) {
      return String(raw || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 5);
    }

    function containsProfanity(name) {
      var value = sanitizePlayerName(name);
      if (!value) return false;
      if (blockedNameExact.indexOf(value) !== -1) return true;
      for (var i = 0; i < blockedNameFragments.length; i++) {
        if (value.indexOf(blockedNameFragments[i]) !== -1) return true;
      }
      return false;
    }

    function formatScoreDate(ts) {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return "-";
      if (!dateFormatter && window.Intl && Intl.DateTimeFormat) {
        dateFormatter = new Intl.DateTimeFormat("fr-BE", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        });
      }
      if (dateFormatter) return dateFormatter.format(d);
      return d.toLocaleDateString("fr-BE");
    }

    function normalizeHighScoreEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      var name = sanitizePlayerName(entry.name);
      if (name.length < 1 || name.length > 5) return null;
      if (containsProfanity(name)) return null;
      var score = Math.max(0, Math.round(Number(entry.score) || 0));
      var level = Math.max(1, Math.round(Number(entry.level) || 1));
      var at = Math.round(Number(entry.at) || Date.now());
      return {
        name: name,
        score: score,
        level: level,
        at: at,
      };
    }

    function sortHighScores() {
      highScores.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (b.level !== a.level) return b.level - a.level;
        return a.at - b.at;
      });
    }

    function clampHighScoresToTopTen() {
      if (highScores.length > 10) {
        highScores = highScores.slice(0, 10);
      }
    }

    function scoreQualifiesTopTen(score, level) {
      var s = Math.max(0, Math.round(Number(score) || 0));
      var l = Math.max(1, Math.round(Number(level) || 1));
      if (highScores.length < 10) return true;
      var edge = highScores[9];
      if (!edge) return true;
      if (s > edge.score) return true;
      if (s < edge.score) return false;
      if (l > edge.level) return true;
      return false;
    }

    function saveHighScores() {
      try {
        window.localStorage.setItem(highScoreStoreKey, JSON.stringify(highScores));
      } catch (err) {
        // Ignore storage failures.
      }
    }

    function renderHighScores() {
      if (!boardBodyNode) return;
      if (!highScores.length) {
        boardBodyNode.innerHTML =
          '<tr><td class="invader-board-empty" colspan="5">Aucun score enregistre pour le moment.</td></tr>';
        return;
      }
      boardBodyNode.innerHTML = highScores.map(function (entry, idx) {
        return (
          "<tr>" +
            "<td>" + (idx + 1) + "</td>" +
            "<td>" + entry.name + "</td>" +
            "<td>" + entry.score + "</td>" +
            "<td>" + entry.level + "</td>" +
            "<td>" + formatScoreDate(entry.at) + "</td>" +
          "</tr>"
        );
      }).join("");
    }

    function loadHighScores() {
      highScores = [];
      try {
        var raw = window.localStorage.getItem(highScoreStoreKey);
        var parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          for (var i = 0; i < parsed.length; i++) {
            var clean = normalizeHighScoreEntry(parsed[i]);
            if (clean) highScores.push(clean);
          }
        }
      } catch (err) {
        highScores = [];
      }
      sortHighScores();
      clampHighScoresToTopTen();
      saveHighScores();
      renderHighScores();
    }

    function drawTopScoresInCanvas(x, y, maxRows) {
      var rows = highScores.slice(0, maxRows);
      ctx.textAlign = "left";
      ctx.font = "600 13px Manrope, system-ui, sans-serif";
      if (!rows.length) {
        ctx.fillStyle = "rgba(203, 210, 220, 0.9)";
        ctx.fillText("Aucun score enregistre.", x, y);
        return;
      }
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var yy = y + i * 24;
        ctx.fillStyle = i < 3 ? "rgba(245, 247, 251, 0.98)" : "rgba(203, 210, 220, 0.9)";
        ctx.fillText((i + 1) + ".", x, yy);
        ctx.fillText(row.name, x + 34, yy);
        ctx.fillText(String(row.score), x + 130, yy);
        ctx.fillStyle = "rgba(171, 176, 196, 0.9)";
        ctx.fillText("N" + row.level, x + 220, yy);
      }
    }

    function startTitleScreen() {
      clearTitleReturnTimer();
      state = {
        mode: "title",
        titleTimer: 0,
        titleShowScores: false,
        score: 0,
        lives: 3,
        level: 1,
        paused: false,
        gameOver: false,
        player: {
          x: 0,
          y: 0,
          w: 34,
          h: 18,
          speed: 340,
          invuln: 0,
        },
        bullets: [],
        enemyBullets: [],
        invaders: [],
        invaderDir: 1,
        invaderSpeed: 42,
        shootCooldown: 0,
        enemyShootCooldown: 1,
        saucer: {
          active: false,
          x: 0,
          y: 0,
          w: 58,
          h: 22,
          vx: 0,
        },
        nextSaucerIn: 5.0,
        auraInvader: null,
        auraTimer: 0,
        nextAuraIn: 3.2,
        nameEntry: "",
        nameEntryMessage: "",
        nameEntrySubmitted: false,
      };
      updateStats("Ecran titre");
    }

    function startGameplay() {
      clearTitleReturnTimer();
      if (!state) startTitleScreen();
      state.mode = "playing";
      state.titleTimer = 0;
      state.titleShowScores = false;
      state.score = 0;
      state.lives = 3;
      state.level = 1;
      state.paused = false;
      state.gameOver = false;
      state.player = {
        x: 0,
        y: 0,
        w: 34,
        h: 18,
        speed: 340,
        invuln: 0,
      };
      state.bullets = [];
      state.enemyBullets = [];
      state.invaders = [];
      state.invaderDir = 1;
      state.invaderSpeed = 42;
      state.shootCooldown = 0;
      state.enemyShootCooldown = 1;
      state.saucer = {
        active: false,
        x: 0,
        y: 0,
        w: 58,
        h: 22,
        vx: 0,
      };
      resetSaucerCycle(true);
      resetAuraCycle(true);
      state.nameEntry = "";
      state.nameEntryMessage = "";
      state.nameEntrySubmitted = false;
      spawnInvaders();
      placePlayer();
      updateStats("Pret");
    }

    function beginNameEntry() {
      if (!state || state.mode === "name_entry") return;
      clearAuraInvader();
      keys.left = false;
      keys.right = false;
      keys.shoot = false;
      state.mode = "name_entry";
      state.paused = false;
      state.gameOver = true;
      state.nameEntry = "";
      state.nameEntrySubmitted = false;
      if (!scoreQualifiesTopTen(state.score, state.level)) {
        state.nameEntrySubmitted = true;
        state.nameEntryMessage = "Score hors Top 10. Aucun encodage possible.";
        updateStats("Hors Top 10");
        scheduleReturnToTitle(2200);
        return;
      }
      state.nameEntryMessage = "Entrez votre nom (1-5 lettres), puis Enter.";
      updateStats("Game Over");
    }

    function submitScore(nameValue) {
      if (!state || state.mode !== "name_entry" || state.nameEntrySubmitted) return false;
      var name = sanitizePlayerName(nameValue);
      if (!name.length) {
        state.nameEntryMessage = "Le nom doit contenir au moins 1 lettre.";
        return false;
      }
      if (containsProfanity(name)) {
        state.nameEntryMessage = "Nom non autorise. Choisissez un autre nom.";
        return false;
      }
      highScores.push({
        name: name,
        score: Math.max(0, Math.round(state.score || 0)),
        level: Math.max(1, Math.round(state.level || 1)),
        at: Date.now(),
      });
      sortHighScores();
      clampHighScoresToTopTen();
      saveHighScores();
      renderHighScores();
      state.nameEntry = name;
      state.nameEntrySubmitted = true;
      state.nameEntryMessage = "Score enregistre. Retour a l'ecran titre...";
      updateStats("Score enregistre");
      scheduleReturnToTitle();
      return true;
    }

    function updateStats(extra) {
      if (!statsNode || !state) return;
      var parts = [
        "Score " + state.score,
        "Vies " + state.lives,
        "Niveau " + state.level
      ];
      if (extra) parts.push(extra);
      statsNode.textContent = parts.join("  ·  ");
    }

    function resetGame() {
      startGameplay();
    }

    function firePlayerBullet() {
      var p = state.player;
      state.bullets.push({
        x: p.x + p.w / 2 - 2,
        y: p.y - 12,
        w: 4,
        h: 12,
        vy: -430,
      });
      state.shootCooldown = 0.2;
      playPlayerShootSound();
    }

    function collectShooters() {
      var byColumn = {};
      for (var i = 0; i < state.invaders.length; i++) {
        var inv = state.invaders[i];
        if (!inv.alive) continue;
        var prev = byColumn[inv.col];
        if (!prev || inv.y > prev.y) byColumn[inv.col] = inv;
      }
      return Object.keys(byColumn).map(function (k) { return byColumn[k]; });
    }

    function fireEnemyBullet() {
      var shooters = collectShooters();
      if (!shooters.length) return;
      var src = shooters[Math.floor(Math.random() * shooters.length)];
      state.enemyBullets.push({
        x: src.x + src.w / 2 - 2,
        y: src.y + src.h + 2,
        w: 4,
        h: 10,
        vy: 180 + state.level * 20,
      });
      playEnemyShootSound();
    }

    function intersects(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function advanceLevel() {
      state.level += 1;
      state.bullets = [];
      state.enemyBullets = [];
      resetAuraCycle(true);
      spawnInvaders();
      placePlayer();
      state.player.invuln = 0.9;
      updateStats("Niveau suivant");
      playLevelUpSound();
    }

    function updateGame(dt) {
      if (!state) return;
      if (state.mode === "title") {
        state.titleTimer += dt;
        if (state.titleTimer >= titleSwapDelay) {
          state.titleTimer = 0;
          state.titleShowScores = !state.titleShowScores;
        }
        return;
      }
      if (state.mode !== "playing" || state.paused || state.gameOver) return;
      var p = state.player;
      var w = worldWidth();
      var h = worldHeight();

      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

      var dir = 0;
      if (keys.left) dir -= 1;
      if (keys.right) dir += 1;
      p.x += dir * p.speed * dt;
      p.x = Math.max(12, Math.min(w - p.w - 12, p.x));

      state.shootCooldown = Math.max(0, state.shootCooldown - dt);
      if (keys.shoot && state.shootCooldown <= 0) {
        firePlayerBullet();
      }

      for (var i = state.bullets.length - 1; i >= 0; i--) {
        var b = state.bullets[i];
        b.y += b.vy * dt;
        if (b.y + b.h < 0) state.bullets.splice(i, 1);
      }

      for (var j = state.enemyBullets.length - 1; j >= 0; j--) {
        var eb = state.enemyBullets[j];
        eb.y += eb.vy * dt;
        if (eb.y > h + 16) state.enemyBullets.splice(j, 1);
      }

      updateSaucer(dt);

      var aliveInvaders = [];
      for (var ii = 0; ii < state.invaders.length; ii++) {
        if (state.invaders[ii].alive) aliveInvaders.push(state.invaders[ii]);
      }

      if (!aliveInvaders.length) {
        clearAuraInvader();
        advanceLevel();
        aliveInvaders = [];
      } else {
        updateAuraInvader(dt, aliveInvaders);
        var step = state.invaderSpeed * dt * state.invaderDir;
        var hitEdge = false;
        for (var a = 0; a < aliveInvaders.length; a++) {
          var inv = aliveInvaders[a];
          var nextX = inv.x + step;
          if (nextX < 12 || nextX + inv.w > w - 12) {
            hitEdge = true;
            break;
          }
        }
        if (hitEdge) {
          state.invaderDir *= -1;
          for (var d = 0; d < aliveInvaders.length; d++) {
            aliveInvaders[d].y += 16;
          }
        } else {
          for (var m = 0; m < aliveInvaders.length; m++) {
            aliveInvaders[m].x += step;
          }
        }

        for (var g = 0; g < aliveInvaders.length; g++) {
          if (aliveInvaders[g].y + aliveInvaders[g].h >= p.y - 10) {
            if (!state.gameOver) {
              playGameOverSound();
              beginNameEntry();
            }
            return;
          }
        }
      }

      state.enemyShootCooldown -= dt;
      if (state.enemyShootCooldown <= 0) {
        fireEnemyBullet();
        state.enemyShootCooldown = Math.max(0.22, (1.08 - state.level * 0.06)) * (0.7 + Math.random() * 0.7);
      }

      for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
        var bullet = state.bullets[bi];
        var hit = false;

        if (state.saucer && state.saucer.active && intersects(bullet, state.saucer)) {
          state.saucer.active = false;
          resetSaucerCycle(false);
          state.score += saucerBonusPoints;
          state.bullets.splice(bi, 1);
          playSaucerHitSound();
          updateStats("Soucoupe +" + saucerBonusPoints);
          continue;
        }

        for (var iv = state.invaders.length - 1; iv >= 0; iv--) {
          var target = state.invaders[iv];
          if (!target.alive) continue;
          if (!intersects(bullet, target)) continue;
          target.alive = false;
          state.score += 20;
          if (state.auraInvader === target && state.auraTimer > 0) {
            state.score += auraBonusPoints;
            playAuraBonusSound();
            updateStats("Aura mauve +" + auraBonusPoints);
            resetAuraCycle(false);
          }
          state.bullets.splice(bi, 1);
          playInvaderHitSound();
          hit = true;
          break;
        }
        if (hit) continue;
      }

      for (var ei = state.enemyBullets.length - 1; ei >= 0; ei--) {
        var eBullet = state.enemyBullets[ei];
        if (!intersects(eBullet, p)) continue;
        state.enemyBullets.splice(ei, 1);
        if (p.invuln > 0) continue;
        state.lives -= 1;
        p.invuln = 1.25;
        playPlayerHitSound();
        if (state.lives <= 0) {
          if (!state.gameOver) {
            playGameOverSound();
            beginNameEntry();
          }
          return;
        }
      }

      updateStats(state.paused ? "Pause" : "");
    }

    function drawInvader(inv) {
      var hasAura = !!(state && state.auraInvader === inv && state.auraTimer > 0);
      if (hasAura) {
        var pulse = 0.2 + ((Math.sin(performance.now() * 0.012) + 1) * 0.18);
        ctx.save();
        ctx.fillStyle = "rgba(223, 134, 255," + pulse.toFixed(3) + ")";
        ctx.shadowColor = "rgba(219, 121, 255, 0.95)";
        ctx.shadowBlur = 20;
        ctx.fillRect(
          Math.round(inv.x - 7),
          Math.round(inv.y - 6),
          inv.w + 14,
          inv.h + 12
        );
        ctx.restore();
      }
      var pattern = [
        "00111100",
        "11111111",
        "11011011",
        "11111111",
        "00100100",
        "01000010"
      ];
      var px = Math.max(2, Math.floor(inv.w / 8));
      var py = Math.max(2, Math.floor(inv.h / 6));
      var tone = hasAura ? "#f1a3ff" : (inv.row % 2 ? "#8a7bff" : "#e64bff");
      ctx.fillStyle = tone;
      for (var r = 0; r < pattern.length; r++) {
        for (var c = 0; c < pattern[r].length; c++) {
          if (pattern[r].charAt(c) !== "1") continue;
          ctx.fillRect(
            Math.round(inv.x + c * px),
            Math.round(inv.y + r * py),
            px,
            py
          );
        }
      }
    }

    function drawSaucer(ufo) {
      if (!ufo || !ufo.active) return;
      var pattern = [
        "000001111111100000",
        "000111111111111000",
        "001111011111011110",
        "111111111111111111",
        "001110000000001110",
        "000011000000011000",
      ];
      var px = Math.max(2, Math.floor(ufo.w / pattern[0].length));
      var py = Math.max(2, Math.floor(ufo.h / pattern.length));
      ctx.save();
      ctx.shadowColor = "rgba(127, 247, 255, 0.78)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#7ff7ff";
      for (var r = 0; r < pattern.length; r++) {
        for (var c = 0; c < pattern[r].length; c++) {
          if (pattern[r].charAt(c) !== "1") continue;
          ctx.fillRect(
            Math.round(ufo.x + c * px),
            Math.round(ufo.y + r * py),
            px,
            py
          );
        }
      }
      ctx.restore();
    }

    function drawPlayer(ts) {
      var p = state.player;
      if (p.invuln > 0 && Math.floor(ts / 80) % 2 === 0) return;
      ctx.save();
      ctx.shadowColor = "rgba(127, 247, 255, 0.66)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#f5f7fb";
      ctx.fillRect(Math.round(p.x + 12), Math.round(p.y), 10, 6);
      ctx.fillRect(Math.round(p.x + 6), Math.round(p.y + 6), 22, 6);
      ctx.fillRect(Math.round(p.x), Math.round(p.y + 12), 34, 6);
      ctx.restore();
    }

    function drawTitleOverlay(w, h) {
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(0, 0, w, h);
      ctx.shadowColor = "rgba(127, 247, 255, 0.6)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#f5f7fb";
      ctx.textAlign = "center";
      if (state.titleShowScores) {
        ctx.font = "700 30px Manrope, system-ui, sans-serif";
        ctx.fillText("HIGHSCORES", w / 2, 96);
        ctx.font = "600 12px Manrope, system-ui, sans-serif";
        ctx.fillStyle = "rgba(203,210,220,0.9)";
        ctx.fillText("Les meilleurs joueurs de tous les temps", w / 2, 124);
        drawTopScoresInCanvas(Math.max(40, w / 2 - 170), 160, 10);
      } else {
        ctx.font = "700 34px Manrope, system-ui, sans-serif";
        ctx.fillStyle = "#f5f7fb";
        ctx.fillText("UNDERSIDE INVADERS", w / 2, h / 2 - 48);
        ctx.font = "600 14px Manrope, system-ui, sans-serif";
        ctx.fillStyle = "rgba(203,210,220,0.92)";
        ctx.fillText("Press Space or Enter to start", w / 2, h / 2 - 10);
        ctx.fillText("R to restart · Esc to close", w / 2, h / 2 + 18);
      }
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }

    function drawNameEntryOverlay(ts, w, h) {
      ctx.fillStyle = "rgba(0,0,0,0.64)";
      ctx.fillRect(0, 0, w, h);
      ctx.shadowColor = "rgba(127, 247, 255, 0.6)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#f5f7fb";
      ctx.textAlign = "center";
      ctx.font = "700 34px Manrope, system-ui, sans-serif";
      ctx.fillText("GAME OVER", w / 2, h / 2 - 86);
      ctx.font = "600 14px Manrope, system-ui, sans-serif";
      ctx.fillText("Score " + state.score + " · Niveau " + state.level, w / 2, h / 2 - 56);
      var canEnterName = !state.nameEntrySubmitted;
      var entry = state.nameEntry || "";
      var cursor = canEnterName && Math.floor(ts / 320) % 2 === 0 ? "_" : "";
      ctx.font = "700 24px Manrope, system-ui, sans-serif";
      if (canEnterName || entry) {
        ctx.fillText("Nom: " + (entry || "") + cursor, w / 2, h / 2 - 10);
      } else {
        ctx.fillText("Top 10 requis", w / 2, h / 2 - 10);
      }
      ctx.font = "600 13px Manrope, system-ui, sans-serif";
      if (state.nameEntryMessage) {
        ctx.fillStyle = "rgba(203,210,220,0.96)";
        ctx.fillText(state.nameEntryMessage, w / 2, h / 2 + 22);
      }
      ctx.fillStyle = "rgba(203,210,220,0.92)";
      if (canEnterName) {
        ctx.fillText("1 a 5 lettres · Backspace pour effacer · Enter pour valider", w / 2, h / 2 + 48);
      } else if (!entry) {
        ctx.fillText("Seuls les 10 meilleurs scores peuvent etre enregistres", w / 2, h / 2 + 48);
      } else {
        ctx.fillText("Retour automatique vers l'ecran titre", w / 2, h / 2 + 48);
      }
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }

    function drawGame(ts) {
      if (!ctx || !state) return;
      var w = worldWidth();
      var h = worldHeight();

      ctx.clearRect(0, 0, w, h);

      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#06070d");
      bg.addColorStop(1, "#020307");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      if (state.mode !== "title") {
        ctx.save();
        ctx.shadowColor = "rgba(230, 75, 255, 0.58)";
        ctx.shadowBlur = 10;
        for (var i = 0; i < state.invaders.length; i++) {
          if (!state.invaders[i].alive) continue;
          drawInvader(state.invaders[i]);
        }
        ctx.restore();

        ctx.save();
        ctx.shadowColor = "rgba(235, 247, 255, 0.72)";
        ctx.shadowBlur = 7;
        ctx.fillStyle = "#f5f7fb";
        for (var b = 0; b < state.bullets.length; b++) {
          var bullet = state.bullets[b];
          ctx.fillRect(Math.round(bullet.x), Math.round(bullet.y), bullet.w, bullet.h);
        }
        ctx.restore();

        ctx.save();
        ctx.shadowColor = "rgba(255, 122, 223, 0.75)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#ff7adf";
        for (var eb = 0; eb < state.enemyBullets.length; eb++) {
          var eBullet = state.enemyBullets[eb];
          ctx.fillRect(Math.round(eBullet.x), Math.round(eBullet.y), eBullet.w, eBullet.h);
        }
        ctx.restore();

        drawSaucer(state.saucer);

        drawPlayer(ts);

        ctx.save();
        ctx.shadowColor = "rgba(127, 247, 255, 0.55)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "rgba(245,247,251,0.9)";
        ctx.font = "600 14px Manrope, system-ui, sans-serif";
        ctx.fillText("Score: " + state.score, 14, 24);
        ctx.fillText("Lives: " + state.lives, 140, 24);
        ctx.fillText("Level: " + state.level, 242, 24);
        ctx.restore();
      }

      if (state.mode === "title") {
        drawTitleOverlay(w, h);
      } else if (state.mode === "name_entry") {
        drawNameEntryOverlay(ts, w, h);
      } else if (state.paused || state.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, w, h);
        ctx.shadowColor = "rgba(127, 247, 255, 0.6)";
        ctx.shadowBlur = 14;
        ctx.fillStyle = "#f5f7fb";
        ctx.textAlign = "center";
        ctx.font = "700 34px Manrope, system-ui, sans-serif";
        ctx.fillText(state.gameOver ? "GAME OVER" : "PAUSE", w / 2, h / 2 - 14);
        ctx.font = "600 14px Manrope, system-ui, sans-serif";
        ctx.fillText(state.gameOver ? "Press R to restart or Esc to close" : "Press P to resume", w / 2, h / 2 + 22);
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";
      }

      var vignette = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        Math.min(w, h) * 0.08,
        w * 0.5,
        h * 0.52,
        Math.max(w, h) * 0.66
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      for (var scanY = 0; scanY < h; scanY += 3) {
        ctx.fillRect(0, scanY, w, 1);
      }
    }

    function gameLoop(ts) {
      if (!isOpen) return;
      if (!lastFrameTs) lastFrameTs = ts;
      var dt = Math.min(0.05, (ts - lastFrameTs) / 1000);
      lastFrameTs = ts;
      updateGame(dt);
      drawGame(ts);
      rafId = window.requestAnimationFrame(gameLoop);
    }

    function closeGame() {
      isOpen = false;
      clearTitleReturnTimer();
      keys.left = false;
      keys.right = false;
      keys.shoot = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (overlay) overlay.classList.remove("is-open");
      document.body.classList.remove("space-invader-open");
    }

    function openGame() {
      ensureUI();
      if (!isDesktopInvaderMode()) return;
      overlay.classList.add("is-open");
      document.body.classList.add("space-invader-open");
      isOpen = true;
      resizeCanvas();
      startTitleScreen();
      playSciFiFiveNote();
      showSpaceInvader();
      if (rafId) window.cancelAnimationFrame(rafId);
      lastFrameTs = performance.now();
      rafId = window.requestAnimationFrame(gameLoop);
    }

    function shouldIgnoreKeyTarget(target) {
      if (!target) return false;
      var tag = target.tagName ? target.tagName.toLowerCase() : "";
      return tag === "input" || tag === "textarea" || target.isContentEditable;
    }

    function handleKeyDown(ev) {
      if (shouldIgnoreKeyTarget(ev.target)) return;

      if (!isOpen) {
        if (!isDesktopInvaderMode()) return;
        if (ev.altKey && ev.shiftKey && (ev.key === "i" || ev.key === "I")) {
          ev.preventDefault();
          openGame();
        }
        return;
      }

      if (ev.key === "Escape") {
        ev.preventDefault();
        closeGame();
        return;
      }
      if (!state) return;

      if (state.mode === "title") {
        if (ev.key === " " || ev.code === "Space" || ev.key === "Enter" || ev.key === "r" || ev.key === "R") {
          resetGame();
          ev.preventDefault();
          return;
        }
        if (ev.key === "h" || ev.key === "H") {
          state.titleShowScores = !state.titleShowScores;
          state.titleTimer = 0;
          ev.preventDefault();
        }
        return;
      }

      if (state.mode === "name_entry") {
        if (ev.key === "Enter") {
          if (state.nameEntrySubmitted) {
            startTitleScreen();
          } else {
            submitScore(state.nameEntry);
          }
          ev.preventDefault();
          return;
        }
        if (!state.nameEntrySubmitted && ev.key === "Backspace") {
          if (state.nameEntry.length) {
            state.nameEntry = state.nameEntry.slice(0, -1);
          }
          state.nameEntryMessage = "Entrez votre nom (1-5 lettres), puis Enter.";
          ev.preventDefault();
          return;
        }
        if (!state.nameEntrySubmitted && /^[a-z]$/i.test(ev.key || "")) {
          if (state.nameEntry.length < 5) {
            state.nameEntry += ev.key.toUpperCase();
          }
          state.nameEntryMessage = "Entrez votre nom (1-5 lettres), puis Enter.";
          ev.preventDefault();
          return;
        }
        if (ev.key === " " || ev.code === "Space") {
          ev.preventDefault();
        }
        return;
      }

      if (ev.key === "p" || ev.key === "P") {
        state.paused = !state.paused;
        updateStats(state.paused ? "Pause" : "");
        ev.preventDefault();
        return;
      }
      if (ev.key === "r" || ev.key === "R") {
        resetGame();
        ev.preventDefault();
        return;
      }
      if (state.paused) return;

      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") {
        keys.left = true;
        ev.preventDefault();
      }
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") {
        keys.right = true;
        ev.preventDefault();
      }
      if (ev.key === " " || ev.code === "Space") {
        keys.shoot = true;
        ev.preventDefault();
      }
    }

    function handleKeyUp(ev) {
      if (!isOpen || !state || state.mode !== "playing") return;
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") keys.left = false;
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") keys.right = false;
      if (ev.key === " " || ev.code === "Space") keys.shoot = false;
    }

    function ensureUI() {
      if (overlay) return;

      launcher = document.createElement("button");
      launcher.type = "button";
      launcher.className = "invader-launcher";
      launcher.setAttribute("aria-label", "Lancer le jeu Space Invaders");
      launcher.setAttribute("title", "Lancer le jeu Space Invaders");
      launcher.innerHTML = '<span class="invader-launcher-icon" aria-hidden="true"></span>';
      launcher.addEventListener("click", openGame);
      document.body.appendChild(launcher);

      overlay = document.createElement("div");
      overlay.className = "invader-overlay";
      overlay.innerHTML =
        '<div class="invader-panel" role="dialog" aria-modal="true" aria-label="Mini jeu Space Invaders">' +
          '<div class="invader-head">' +
            '<button class="invader-close" type="button" aria-label="Fermer le jeu">×</button>' +
          "</div>" +
          '<div class="invader-canvas-wrap">' +
            '<canvas class="invader-canvas" width="960" height="540"></canvas>' +
          "</div>" +
        "</div>";
      document.body.appendChild(overlay);

      canvas = overlay.querySelector(".invader-canvas");
      ctx = canvas.getContext("2d");
      statsNode = null;
      boardBodyNode = null;
      closeNode = overlay.querySelector(".invader-close");

      closeNode.addEventListener("click", closeGame);
      overlay.addEventListener("click", function (ev) {
        if (ev.target === overlay) closeGame();
      });

      window.addEventListener("resize", function () {
        refreshDesktopAvailability();
        if (isOpen) resizeCanvas();
      });
      document.addEventListener("keydown", handleKeyDown, true);
      document.addEventListener("keyup", handleKeyUp, true);
      loadHighScores();
      refreshDesktopAvailability();
      resizeCanvas();
    }

    ensureUI();
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

  initFixedHeaderOffset();
  if (initLanguageRouting()) return;
  initLanguageSwitch();
  initDesktopSpaceInvaders();
  ensureScrollTopBubble();
  initMobileMenus();
})();
