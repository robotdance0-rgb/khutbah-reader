/**
 * Khutbah Reader — Apple HIG & Liquid Glass Controller
 * Supports Traditional Arabic & AlMaghribi Warsh Quran fonts,
 * 60Hz/120Hz sub-pixel smooth auto-scroll on mobile & desktop,
 * and full reading state persistence.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'khutbah_reader_prefs_v3';
  var SPEEDS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 2, 2.1, 2.2, 2.3, 2.5, 3];

  var DEFAULTS = {
    theme: 'modern-light',
    glassVariant: 'regular',
    fontBody: 'traditional',
    fontQuran: 'warsh',
    fontSize: 100,
    lineHeight: '2.1',
    kashida: 'medium',
    width: '40',
    fullscreen: false,
    speed: 1,
    accent: '#007aff',
    reduceTransparency: false
  };

  var state = Object.assign({}, DEFAULTS);

  var el = {
    html: document.documentElement,
    body: document.body,
    toolbar: document.getElementById('toolbar'),
    readingProgress: document.getElementById('readingProgress'),
    readingProgressFill: document.getElementById('readingProgressFill'),
    btnNavChapter: document.getElementById('btnNavChapter'),
    navChapterText: document.getElementById('navChapterText'),
    btnCopy: document.getElementById('btnCopy'),
    btnDark: document.getElementById('btnDark'),
    btnPanel: document.getElementById('btnPanel'),
    btnPanelClose: document.getElementById('btnPanelClose'),
    panel: document.getElementById('panel'),
    panelBackdrop: document.getElementById('panelBackdrop'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    sheet: document.getElementById('sheet'),
    p0: document.getElementById('p0'),
    p2: document.getElementById('p2'),
    chapterSwitch: document.getElementById('chapterSwitch'),
    themeGroup: document.getElementById('themeGroup'),
    fontBodyGroup: document.getElementById('fontBodyGroup'),
    fontQuranGroup: document.getElementById('fontQuranGroup'),
    glassGroup: document.getElementById('glassGroup'),
    sizeDown: document.getElementById('sizeDown'),
    sizeUp: document.getElementById('sizeUp'),
    sizeValue: document.getElementById('sizeValue'),
    sizeSlider: document.getElementById('sizeSlider'),
    leadGroup: document.getElementById('leadGroup'),
    kashidaGroup: document.getElementById('kashidaGroup'),
    widthGroup: document.getElementById('widthGroup'),
    fullToggle: document.getElementById('fullToggle'),
    speedGroup: document.getElementById('speedGroup'),
    autoToggle: document.getElementById('autoToggle'),
    accentSwatches: document.getElementById('accentSwatches'),
    accentColor: document.getElementById('accentColor'),
    lowDataToggle: document.getElementById('lowDataToggle'),
    btnReset: document.getElementById('btnReset'),
    resetModal: document.getElementById('resetModal'),
    btnResetCancel: document.getElementById('btnResetCancel'),
    btnResetConfirm: document.getElementById('btnResetConfirm'),
    btnAutoPlay: document.getElementById('btnAutoPlay'),
    dockPlayLabel: document.getElementById('dockPlayLabel'),
    btnDockSpeed: document.getElementById('btnDockSpeed'),
    btnDockSizeDown: document.getElementById('btnDockSizeDown'),
    btnDockSizeUp: document.getElementById('btnDockSizeUp'),
    btnShare: document.getElementById('btnShare'),
    btnTop: document.getElementById('btnTop'),
    metaThemeColor: document.getElementById('meta-theme-color')
  };

  /* ── Toast Notification HUD ──────────────────────────────────────────── */
  var toastTimer = null;
  var Announce = {
    say: function (msg) {
      if (!el.toast || !el.toastText) return;
      el.toastText.textContent = msg;
      el.toast.classList.add('is-visible');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        el.toast.classList.remove('is-visible');
      }, 2400);
    }
  };

  /* ── Safe LocalStorage Persistence ───────────────────────────────────── */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state = Object.assign({}, DEFAULTS, parsed);
      }
    } catch (e) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /* ── Radio Group Sync Helper ─────────────────────────────────────────── */
  function syncRadios(container, attr, val) {
    if (!container) return;
    var btns = container.querySelectorAll('[role="radio"]');
    for (var i = 0; i < btns.length; i++) {
      var match = String(btns[i].getAttribute(attr)) === String(val);
      btns[i].setAttribute('aria-checked', match ? 'true' : 'false');
    }
  }

  /* ── Apply State to DOM ──────────────────────────────────────────────── */
  function resolveEffectiveTheme(themePref) {
    if (themePref === 'system') {
      var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return isDark ? 'dark' : 'modern-light';
    }
    return themePref;
  }

  function applyState() {
    var effectiveTheme = resolveEffectiveTheme(state.theme);
    el.html.setAttribute('data-theme', effectiveTheme);
    el.html.setAttribute('data-glass', state.glassVariant);
    el.html.setAttribute('data-font-body', state.fontBody);
    el.html.setAttribute('data-font-quran', state.fontQuran);

    el.html.style.setProperty('--fs-scale', (state.fontSize / 100).toFixed(3));
    el.html.style.setProperty('--lh', state.lineHeight);
    el.html.style.setProperty('--measure', state.width + 'rem');
    el.html.style.setProperty('--ios-tint', state.accent);

    el.body.classList.toggle('is-fullscreen', !!state.fullscreen);
    el.body.classList.toggle('reduce-transparency', !!state.reduceTransparency);

    if (el.btnDark) {
      el.btnDark.setAttribute('aria-pressed', effectiveTheme === 'dark' ? 'true' : 'false');
    }
    if (el.sizeValue) el.sizeValue.textContent = state.fontSize + '%';
    if (el.sizeSlider) el.sizeSlider.value = String(state.fontSize);
    if (el.fullToggle) el.fullToggle.checked = !!state.fullscreen;
    if (el.lowDataToggle) el.lowDataToggle.checked = !!state.reduceTransparency;
    if (el.btnDockSpeed) el.btnDockSpeed.textContent = state.speed + '×';
    if (el.accentColor) el.accentColor.value = state.accent;

    syncRadios(el.themeGroup, 'data-theme', state.theme);
    syncRadios(el.fontBodyGroup, 'data-font-body', state.fontBody);
    syncRadios(el.fontQuranGroup, 'data-font-quran', state.fontQuran);
    syncRadios(el.glassGroup, 'data-glass-variant', state.glassVariant);
    syncRadios(el.leadGroup, 'data-lh', state.lineHeight);
    syncRadios(el.kashidaGroup, 'data-kashida', state.kashida);
    syncRadios(el.widthGroup, 'data-width', state.width);
    syncRadios(el.speedGroup, 'data-speed', state.speed);

    if (el.accentSwatches) {
      var swatches = el.accentSwatches.querySelectorAll('.accent-swatch');
      for (var i = 0; i < swatches.length; i++) {
        var c = (swatches[i].getAttribute('data-color') || '').toLowerCase();
        swatches[i].classList.toggle('is-active', c === state.accent.toLowerCase());
      }
    }
  }

  /* ── Smooth 60Hz/120Hz Sub-Pixel Auto-Scroller ───────────────────────── */
  var AutoScroll = {
    active: false,
    pausedByTouch: false,
    rafId: null,
    lastTs: 0,
    subPixelRemainder: 0,
    resumeTimer: null,

    start: function () {
      if (this.active) return;
      this.active = true;
      this.pausedByTouch = false;
      this.lastTs = 0;
      this.subPixelRemainder = 0;
      el.body.classList.add('is-autoscrolling');
      this.syncUI();
      var self = this;
      this.rafId = requestAnimationFrame(function (ts) { self.tick(ts); });
      Announce.say('تم تشغيل التمرير التلقائي (' + state.speed + '×)');
    },

    stop: function (silent, customMsg) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.resumeTimer) {
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.active = false;
      this.pausedByTouch = false;
      this.lastTs = 0;
      this.subPixelRemainder = 0;
      el.body.classList.remove('is-autoscrolling');
      this.syncUI();
      if (!silent) {
        Announce.say(customMsg || 'تم إيقاف التمرير التلقائي');
      }
    },

    toggle: function () {
      if (this.active) {
        this.stop(false);
      } else {
        this.start();
      }
    },

    syncUI: function () {
      if (el.btnAutoPlay) {
        el.btnAutoPlay.classList.toggle('is-playing', this.active);
        el.btnAutoPlay.setAttribute('aria-pressed', this.active ? 'true' : 'false');
      }
      if (el.dockPlayLabel) {
        el.dockPlayLabel.textContent = this.active ? 'إيقاف مؤقت' : 'تمرير تلقائي';
      }
      if (el.autoToggle) {
        el.autoToggle.checked = this.active;
      }
    },

    tick: function (ts) {
      if (!this.active) return;
      var self = this;
      if (this.pausedByTouch) {
        this.lastTs = ts;
        this.rafId = requestAnimationFrame(function (nextTs) { self.tick(nextTs); });
        return;
      }
      if (!this.lastTs) this.lastTs = ts;
      var dt = Math.min(64, Math.max(0, ts - this.lastTs));
      this.lastTs = ts;

      // Base speed: 34 px/sec at 1x, scaled smoothly with sub-pixel accumulator
      var pxPerSec = 34 * Number(state.speed || 1);
      var delta = (pxPerSec * dt) / 1000 + this.subPixelRemainder;
      var step = Math.trunc(delta);
      this.subPixelRemainder = delta - step;

      if (step !== 0) {
        var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        var current = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (current + step >= maxScroll - 2) {
          window.scrollTo(0, maxScroll);
          self.stop(false, 'انتهت الخطبة');
          return;
        }
        window.scrollBy(0, step);
      }
      this.rafId = requestAnimationFrame(function (nextTs) { self.tick(nextTs); });
    }
  };

  /*Pause auto-scroll while user touches/drags on mobile, then resume smoothly*/
  window.addEventListener('touchstart', function (e) {
    if (!AutoScroll.active) return;
    if (e.target && e.target.closest && e.target.closest('#dock, #panel, #toolbar')) return;
    AutoScroll.pausedByTouch = true;
    if (AutoScroll.resumeTimer) clearTimeout(AutoScroll.resumeTimer);
  }, { passive: true });

  window.addEventListener('touchend', function () {
    if (!AutoScroll.active || !AutoScroll.pausedByTouch) return;
    if (AutoScroll.resumeTimer) clearTimeout(AutoScroll.resumeTimer);
    AutoScroll.resumeTimer = setTimeout(function () {
      AutoScroll.lastTs = 0;
      AutoScroll.pausedByTouch = false;
    }, 650);
  }, { passive: true });

  /* ── Scroll Progress & Active Chapter Tracking ───────────────────────── */
  function updateScrollState() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    var maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var pct = Math.min(100, Math.max(0, (scrollTop / maxScroll) * 100));

    if (el.readingProgressFill) {
      el.readingProgressFill.style.width = pct.toFixed(1) + '%';
    }
    if (el.readingProgress) {
      el.readingProgress.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    if (el.toolbar) {
      el.toolbar.classList.toggle('is-scrolled', scrollTop > 90);
    }

    if (el.p2) {
      var rect2 = el.p2.getBoundingClientRect();
      var inSecond = rect2.top <= window.innerHeight * 0.38;
      if (el.navChapterText) {
        el.navChapterText.textContent = inSecond ? 'الخطبة ٢' : 'الخطبة ١';
      }
      if (el.chapterSwitch) {
        var links = el.chapterSwitch.querySelectorAll('a');
        if (links.length >= 2) {
          links[0].classList.toggle('is-active', !inSecond);
          links[1].classList.toggle('is-active', inSecond);
        }
      }
    }
  }

  window.addEventListener('scroll', updateScrollState, { passive: true });

  /* ── Copy & Share Helpers ────────────────────────────────────────────── */
  function copyTextToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        Announce.say(successMsg);
      }).catch(function () {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      Announce.say(successMsg);
    } catch (e) {}
  }

  /* ── Panel Open / Close ──────────────────────────────────────────────── */
  function openPanel() {
    if (!el.panel) return;
    el.panel.hidden = false;
    requestAnimationFrame(function () {
      el.panel.classList.add('is-open');
      if (el.panelBackdrop) el.panelBackdrop.classList.add('is-open');
      if (el.btnPanel) el.btnPanel.setAttribute('aria-expanded', 'true');
    });
  }

  function closePanel() {
    if (!el.panel) return;
    el.panel.classList.remove('is-open');
    if (el.panelBackdrop) el.panelBackdrop.classList.remove('is-open');
    if (el.btnPanel) el.btnPanel.setAttribute('aria-expanded', 'false');
    setTimeout(function () {
      if (!el.panel.classList.contains('is-open')) {
        el.panel.hidden = true;
      }
    }, 360);
  }

  /* ── Event Listeners ─────────────────────────────────────────────────── */
  if (el.btnPanel) {
    el.btnPanel.addEventListener('click', function () {
      var expanded = el.btnPanel.getAttribute('aria-expanded') === 'true';
      if (expanded) closePanel(); else openPanel();
    });
  }
  if (el.btnPanelClose) el.btnPanelClose.addEventListener('click', closePanel);
  if (el.panelBackdrop) el.panelBackdrop.addEventListener('click', closePanel);

  if (el.btnNavChapter) {
    el.btnNavChapter.addEventListener('click', function () {
      if (!el.p0 || !el.p2) return;
      var inSecond = el.p2.getBoundingClientRect().top <= window.innerHeight * 0.38;
      var target = inSecond ? el.p0 : el.p2;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      Announce.say(inSecond ? 'الانتقال إلى الخطبة الأولى' : 'الانتقال إلى الخطبة الثانية');
    });
  }

  if (el.btnDark) {
    el.btnDark.addEventListener('click', function () {
      var currentEffective = resolveEffectiveTheme(state.theme);
      state.theme = currentEffective === 'dark' ? 'modern-light' : 'dark';
      applyState();
      saveState();
      Announce.say(state.theme === 'dark' ? 'تم تفعيل الوضع الليلي' : 'تم تفعيل الوضع النهاري');
    });
  }

  if (el.btnCopy) {
    el.btnCopy.addEventListener('click', function () {
      var cleanText = el.sheet ? el.sheet.innerText : '';
      copyTextToClipboard(cleanText, 'تم نسخ نص الخطبة بالكامل');
    });
  }

  if (el.btnShare) {
    el.btnShare.addEventListener('click', function () {
      var cleanText = el.sheet ? el.sheet.innerText : '';
      var shareUrl = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, text: cleanText.slice(0, 240) + '...', url: shareUrl }).catch(function () {});
      } else {
        copyTextToClipboard(document.title + '\n\n' + cleanText, 'تم نسخ نص الخطبة للمشاركة');
      }
    });
  }

  if (el.btnTop) {
    el.btnTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (el.btnAutoPlay) {
    el.btnAutoPlay.addEventListener('click', function () {
      AutoScroll.toggle();
    });
  }

  if (el.autoToggle) {
    el.autoToggle.addEventListener('change', function () {
      if (el.autoToggle.checked) AutoScroll.start(); else AutoScroll.stop(false);
    });
  }

  if (el.btnDockSpeed) {
    el.btnDockSpeed.addEventListener('click', function () {
      var idx = SPEEDS.indexOf(Number(state.speed));
      var nextIdx = (idx + 1) % SPEEDS.length;
      state.speed = SPEEDS[nextIdx];
      applyState();
      saveState();
      Announce.say('سرعة التمرير: ' + state.speed + '×');
    });
  }

  function changeFontSize(delta) {
    state.fontSize = Math.min(180, Math.max(75, Number(state.fontSize) + delta));
    applyState();
    saveState();
  }

  if (el.sizeDown) el.sizeDown.addEventListener('click', function () { changeFontSize(-5); });
  if (el.sizeUp) el.sizeUp.addEventListener('click', function () { changeFontSize(5); });
  if (el.btnDockSizeDown) el.btnDockSizeDown.addEventListener('click', function () { changeFontSize(-5); });
  if (el.btnDockSizeUp) el.btnDockSizeUp.addEventListener('click', function () { changeFontSize(5); });

  if (el.sizeSlider) {
    el.sizeSlider.addEventListener('input', function () {
      state.fontSize = Number(el.sizeSlider.value);
      applyState();
      saveState();
    });
  }

  function bindRadioGroup(container, attr, stateKey, msgFn) {
    if (!container) return;
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[role="radio"]');
      if (!btn) return;
      var val = btn.getAttribute(attr);
      if (val == null) return;
      state[stateKey] = stateKey === 'speed' ? Number(val) : val;
      applyState();
      saveState();
      if (msgFn) Announce.say(msgFn(state[stateKey]));
    });
  }

  bindRadioGroup(el.themeGroup, 'data-theme', 'theme');
  bindRadioGroup(el.fontBodyGroup, 'data-font-body', 'fontBody', function (v) {
    return v === 'traditional' ? 'تم اختيار خط Traditional Arabic' : (v === 'naskh' ? 'تم اختيار خط النسخ التراثي' : 'تم اختيار خط أبل الرسمي');
  });
  bindRadioGroup(el.fontQuranGroup, 'data-font-quran', 'fontQuran', function (v) {
    return v === 'warsh' ? 'خط الآيات: AlMaghribi Warsh Quran' : 'خط الآيات: Traditional Arabic';
  });
  bindRadioGroup(el.glassGroup, 'data-glass-variant', 'glassVariant');
  bindRadioGroup(el.leadGroup, 'data-lh', 'lineHeight');
  bindRadioGroup(el.kashidaGroup, 'data-kashida', 'kashida');
  bindRadioGroup(el.widthGroup, 'data-width', 'width');
  bindRadioGroup(el.speedGroup, 'data-speed', 'speed', function (v) { return 'سرعة التمرير: ' + v + '×'; });

  if (el.fullToggle) {
    el.fullToggle.addEventListener('change', function () {
      state.fullscreen = el.fullToggle.checked;
      applyState();
      saveState();
    });
  }

  if (el.lowDataToggle) {
    el.lowDataToggle.addEventListener('change', function () {
      state.reduceTransparency = el.lowDataToggle.checked;
      applyState();
      saveState();
    });
  }

  if (el.accentSwatches) {
    el.accentSwatches.addEventListener('click', function (e) {
      var sw = e.target.closest('.accent-swatch');
      if (!sw) return;
      var color = sw.getAttribute('data-color');
      if (color) {
        state.accent = color;
        applyState();
        saveState();
      }
    });
  }

  if (el.accentColor) {
    el.accentColor.addEventListener('input', function () {
      state.accent = el.accentColor.value;
      applyState();
      saveState();
    });
  }

  if (el.btnReset) {
    el.btnReset.addEventListener('click', function () {
      if (el.resetModal) el.resetModal.hidden = false;
    });
  }

  if (el.btnResetCancel) {
    el.btnResetCancel.addEventListener('click', function () {
      if (el.resetModal) el.resetModal.hidden = true;
    });
  }

  if (el.btnResetConfirm) {
    el.btnResetConfirm.addEventListener('click', function () {
      state = Object.assign({}, DEFAULTS);
      applyState();
      saveState();
      if (el.resetModal) el.resetModal.hidden = true;
      Announce.say('تمت استعادة الإعدادات الافتراضية');
    });
  }

  /* ── Initialize ──────────────────────────────────────────────────────── */
  loadState();
  applyState();
  updateScrollState();
})();
