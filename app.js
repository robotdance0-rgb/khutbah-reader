/* ==========================================================================
   Khutbah Reader — Apple Liquid Glass Edition (app.js)
   --------------------------------------------------------------------------
   Implements Apple's Liquid Glass material & interaction behaviors:
     1. Real-time Specular Pointer & Touch Reflection (`interactive(_:)`).
     2. Interactive Liquid Glass Lens on Sliders & Switches during touch/drag.
     3. Adaptive `Regular` and `Clear` Liquid Glass variants (`Glass.regular` / `Glass.clear`).
     4. Dynamic Half-Sheet to Expanded Opaque Sheet transition on scroll/drag.
     5. 60Hz / 120Hz ProMotion GPU Sub-Pixel AutoScroll (`translate3d`) with
        Cached Layout Metrics (zero per-frame layout thrashing on mobile) &
        Arabic Kashida Justification.
   ========================================================================== */

(function () {
  'use strict';

  var PREFS_KEY = 'khutbah.v1.prefs';

  /* The anti-flash bootstrap lives inline in <head> (index.html). This file is
     loaded with `defer`, so anything here runs only after the first paint. */

  function bootApp() {
    var $ = function (id) { return document.getElementById(id); };

    var el = {
      root: document.documentElement,
      body: document.body,
      sheet: $('sheet'),
      reader: $('reader'),
      toolbar: $('toolbar'),
      toolbarTitle: $('toolbarTitle'),
      actionbar: $('actionbar'),
      metaTheme: $('meta-theme-color'),
      metaStatus: $('meta-status-style'),

      btnNavChapter: $('btnNavChapter'),
      navChapterText: $('navChapterText'),
      btnCopy: $('btnCopy'),
      btnSmaller: $('btnSmaller'),
      btnLarger: $('btnLarger'),
      btnAuto: $('btnAuto'),
      btnVoice: $('btnVoice'),
      btnDark: $('btnDark'),
      btnPanel: $('btnPanel'),
      btnPanelClose: $('btnPanelClose'),
      btnTop: $('btnTop'),
      btnReset: $('btnReset'),
      btnShare: $('btnShare'),
      readingProgress: $('readingProgress'),
      readingProgressFill: $('readingProgressFill'),
      chapterSwitch: $('chapterSwitch'),

      toast: $('toast'),
      toastText: $('toastText'),
      resetAlert: $('resetAlert'),
      btnResetCancel: $('btnResetCancel'),
      btnResetConfirm: $('btnResetConfirm'),

      glassGroup: $('glassGroup'),
      widthGroup: $('widthGroup'),
      kashidaGroup: $('kashidaGroup'),
      btnFull: $('btnFull'),
      fullToggle: $('fullToggle'),
      lowDataToggle: $('lowDataToggle'),

      dock: $('dock'),
      dockToggle: $('dockToggle'),
      dockSlower: $('dockSlower'),
      dockFaster: $('dockFaster'),
      dockSpeed: $('dockSpeed'),

      panel: $('panel'),
      panelBody: $('panelBody'),
      scrim: $('scrim'),
      themeGroup: $('themeGroup'),
      leadGroup: $('leadGroup'),
      sizeUp: $('sizeUp'),
      sizeDown: $('sizeDown'),
      sizeValue: $('sizeValue'),
      sizeSlider: $('sizeSlider'),
      accentColor: $('accentColor'),
      accentSwatches: $('accentSwatches'),
      speedGroup: $('speedGroup'),
      autoToggle: $('autoToggle'),
      readingMeta: $('readingMeta'),
      live: $('live')
    };

    /* -------------------------------------------------------------------- */
    /* Store — localStorage wrapper                                         */
    /* -------------------------------------------------------------------- */

    var Store = {
      available: (function () {
        try {
          var k = '__khutbah_probe__';
          localStorage.setItem(k, '1');
          localStorage.removeItem(k);
          return true;
        } catch (e) { return false; }
      })(),

      read: function (key, fallback) {
        if (!this.available) return fallback;
        try {
          var raw = localStorage.getItem(key);
          return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
      },

      write: function (key, value) {
        if (!this.available) return false;
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (e) { return false; }
      },

      remove: function (key) {
        if (!this.available) return;
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
      }
    };

    /* -------------------------------------------------------------------- */
    /* Prefs                                                                 */
    /* -------------------------------------------------------------------- */

    var DOC_ID = el.sheet.getAttribute('data-document-id') || 'default';
    /* v2: paragraphs were split into smaller anchors, so v1 positions no longer map. */
    var PROGRESS_KEY = 'khutbah.v2.progress.' + DOC_ID;

    var WIDTHS = [32, 40, 48, 64];
    var THEMES = ['system', 'warm-paper', 'modern-light', 'sepia', 'dark', 'blue-gray'];
    var THEME_COLORS = {
      'warm-paper': '#efe6d5',
      'modern-light': '#f2f2f7',
      'sepia': '#e6d8be',
      'dark': '#000000',
      'blue-gray': '#e2e8f0'
    };

    var SIZE_MIN = 0.75, SIZE_MAX = 1.8, SIZE_STEP = 0.08;
    var SPEED_PRESETS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 3];

    var Prefs = {
      data: null,

      defaults: function () {
        return {
          theme: 'modern-light',
          lightTheme: 'modern-light',
          glassVariant: 'regular',
          accentColor: '#007aff',
          fontScale: 1,
          lineHeight: 2.1,
          measure: 40,
          speed: 1,
          autoScroll: false,
          lowData: null,
          kashida: 'medium'
        };
      },

      load: function () {
        var d = this.defaults();
        var saved = Store.read(PREFS_KEY, {}) || {};
        for (var k in d) {
          if (Object.prototype.hasOwnProperty.call(saved, k)) d[k] = saved[k];
        }
        if (THEMES.indexOf(d.theme) === -1) d.theme = 'modern-light';
        if (THEMES.indexOf(d.lightTheme) === -1 || d.lightTheme === 'dark' || d.lightTheme === 'system') {
          d.lightTheme = 'modern-light';
        }
        if (d.glassVariant !== 'clear' && d.glassVariant !== 'regular') {
          d.glassVariant = 'regular';
        }
        if (!/^#[0-9a-f]{6}$/i.test(d.accentColor)) d.accentColor = '#007aff';
        d.accentColor = d.accentColor.toLowerCase();
        d.fontScale = clamp(Number(d.fontScale) || 1, SIZE_MIN, SIZE_MAX);
        if (!KASHIDA_LEVELS.hasOwnProperty(d.kashida)) d.kashida = 'medium';
        if (WIDTHS.indexOf(Number(d.measure)) === -1) d.measure = 40;
        d.measure = Number(d.measure);
        d.speed = nearestPreset(Number(d.speed) || 1);
        var lh = Number(d.lineHeight);
        d.lineHeight = (lh >= 1.5 && lh <= 3) ? lh : 2.1;
        this.data = d;
        return d;
      },

      set: function (key, value) {
        this.data[key] = value;
        this.save();
      },

      save: function () { Store.write(PREFS_KEY, this.data); }
    };

    function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

    function nearestPreset(value) {
      var best = SPEED_PRESETS[0], bestDiff = Infinity;
      for (var i = 0; i < SPEED_PRESETS.length; i++) {
        var diff = Math.abs(SPEED_PRESETS[i] - value);
        if (diff < bestDiff) { bestDiff = diff; best = SPEED_PRESETS[i]; }
      }
      return best;
    }

    function stepPreset(value, dir) {
      var i = SPEED_PRESETS.indexOf(nearestPreset(value));
      i = clamp(i + dir, 0, SPEED_PRESETS.length - 1);
      return SPEED_PRESETS[i];
    }

    function formatSpeed(value) {
      var text = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
      return text + '×';
    }

    /* -------------------------------------------------------------------- */
    /* Announce & Toast HUD                                                  */
    /* -------------------------------------------------------------------- */

    var Announce = {
      timer: 0,
      toastTimer: 0,

      say: function (message, showToast) {
        if (el.live) {
          clearTimeout(this.timer);
          el.live.textContent = '';
          this.timer = setTimeout(function () { el.live.textContent = message; }, 40);
        }
        if (showToast && el.toast && el.toastText) {
          clearTimeout(this.toastTimer);
          el.toastText.textContent = message;
          el.toast.classList.add('is-visible');
          this.toastTimer = setTimeout(function () {
            el.toast.classList.remove('is-visible');
          }, 2200);
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* LiquidGlass — Apple Optical Material & Interactive Controller         */
    /* -------------------------------------------------------------------- */

    var LiquidGlass = {
      names: {
        regular: 'قياسي (Regular)',
        clear: 'شفاف (Clear)'
      },

      applyVariant: function (variant, announce) {
        if (variant !== 'clear' && variant !== 'regular') variant = 'regular';
        el.root.setAttribute('data-glass', variant);
        Prefs.set('glassVariant', variant);

        if (el.glassGroup) {
          var buttons = el.glassGroup.querySelectorAll('[data-glass-variant]');
          for (var i = 0; i < buttons.length; i++) {
            var active = buttons[i].getAttribute('data-glass-variant') === variant;
            buttons[i].setAttribute('aria-checked', String(active));
          }
        }
        if (announce) {
          Announce.say('نمط Liquid Glass: ' + this.names[variant], true);
        }
      },

      bindInteractiveSurfaces: function () {
        var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        var surfaces = document.querySelectorAll('.lg-interactive');
        surfaces.forEach(function (node) {
          function updateCoords(clientX, clientY) {
            var rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var x = ((clientX - rect.left) / rect.width) * 100;
            var y = ((clientY - rect.top) / rect.height) * 100;
            node.style.setProperty('--lg-x', x.toFixed(1) + '%');
            node.style.setProperty('--lg-y', y.toFixed(1) + '%');
          }

          if (canHover) {
            node.addEventListener('pointermove', function (e) {
              updateCoords(e.clientX, e.clientY);
            }, { passive: true });
          }

          node.addEventListener('pointerdown', function (e) {
            node.classList.add('is-touching');
            updateCoords(e.clientX, e.clientY);
          }, { passive: true });

          ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
            node.addEventListener(evt, function () {
              node.classList.remove('is-touching');
            }, { passive: true });
          });
        });

        if (el.sizeSlider) {
          ['pointerdown', 'touchstart'].forEach(function (evt) {
            el.sizeSlider.addEventListener(evt, function () {
              el.sizeSlider.classList.add('is-glass-active');
            }, { passive: true });
          });
          ['pointerup', 'pointercancel', 'touchend', 'blur'].forEach(function (evt) {
            window.addEventListener(evt, function () {
              el.sizeSlider.classList.remove('is-glass-active');
            }, { passive: true });
          });
        }

        var switches = document.querySelectorAll('.switch');
        switches.forEach(function (sw) {
          ['pointerdown', 'touchstart'].forEach(function (evt) {
            sw.addEventListener(evt, function () {
              sw.classList.add('is-glass-active');
            }, { passive: true });
          });
          ['pointerup', 'pointercancel', 'pointerleave', 'touchend'].forEach(function (evt) {
            sw.addEventListener(evt, function () {
              sw.classList.remove('is-glass-active');
            }, { passive: true });
          });
        });

        if (el.panelBody && el.panel) {
          el.panelBody.addEventListener('scroll', function () {
            el.panel.classList.toggle('is-expanded', el.panelBody.scrollTop > 24);
          }, { passive: true });
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* Metrics — Cached Layout Geometry (Zero Per-Frame Layout Thrashing)    */
    /* -------------------------------------------------------------------- */

    var Metrics = {
      lineHeight: 42,
      maxScroll: 0,
      winHeight: 800,
      sheetTop: 0,
      sheetAvailable: 1,
      p0Top: 0,
      p2Top: 0,
      chapterLinks: [],

      refresh: function () {
        var currentOffset = AutoScroll ? (AutoScroll.offset || 0) : 0;
        var scrollY = window.scrollY;
        var winH = window.innerHeight || 800;

        this.winHeight = winH;
        this.lineHeight = parseFloat(getComputedStyle(el.sheet).lineHeight) || 42;
        this.maxScroll = Math.max(0, document.documentElement.scrollHeight - winH);

        var sheetRect = el.sheet.getBoundingClientRect();
        this.sheetTop = sheetRect.top + scrollY + currentOffset;
        this.sheetAvailable = Math.max(1, el.sheet.offsetHeight - winH);

        var p0 = $('p0');
        var p2 = $('p2');
        this.p0Top = p0 ? (p0.getBoundingClientRect().top + scrollY + currentOffset) : 0;
        this.p2Top = p2 ? (p2.getBoundingClientRect().top + scrollY + currentOffset) : 0;
        this.chapterLinks = el.chapterSwitch
          ? Array.prototype.slice.call(el.chapterSwitch.querySelectorAll('a'))
          : [];

        Anchor.refreshOffsets(scrollY + currentOffset);
      }
    };

    function effectiveScrollY() {
      return (AutoScroll && AutoScroll.running && !AutoScroll.parked)
        ? AutoScroll.virtualY
        : window.scrollY;
    }

    function offsetTop(node) {
      var currentOffset = AutoScroll ? (AutoScroll.offset || 0) : 0;
      return node.getBoundingClientRect().top + window.scrollY + currentOffset;
    }

    function maxScroll() {
      return Metrics.maxScroll;
    }

    /* -------------------------------------------------------------------- */
    /* Anchor — hold the reader's place across a reflow                      */
    /* -------------------------------------------------------------------- */

    var Anchor = {
      blocks: [],
      blockMetrics: [],

      collect: function () {
        this.blocks = Array.prototype.slice.call(
          el.sheet.querySelectorAll('[id^="p"], [id^="b"]')
        );
      },

      refreshOffsets: function (docScrollBase) {
        var base = typeof docScrollBase === 'number'
          ? docScrollBase
          : (window.scrollY + (AutoScroll ? (AutoScroll.offset || 0) : 0));
        this.blockMetrics = [];
        for (var i = 0; i < this.blocks.length; i++) {
          var b = this.blocks[i];
          var rect = b.getBoundingClientRect();
          this.blockMetrics.push({
            id: b.id,
            top: rect.top + base,
            height: Math.max(1, rect.height || b.offsetHeight || 1)
          });
        }
      },

      current: function (customY) {
        var y = typeof customY === 'number' ? customY : effectiveScrollY();
        var line = y + Metrics.winHeight * 0.3;
        if (!this.blockMetrics.length) this.refreshOffsets();
        var list = this.blockMetrics;
        if (!list.length) return null;

        /* At the very top the reader is looking at the title, not a paragraph:
           pin to 0 instead of "paragraph at 30% of the screen", which used to
           push the page down ~100–180px on every load / font-size change. */
        if (y <= 1) return { top: true };

        var found = list[0];
        for (var i = 0; i < list.length; i++) {
          if (list[i].top <= line) found = list[i];
          else break;
        }
        var into = line - found.top;
        return {
          id: found.id,
          ratio: clamp(into / found.height, 0, 1),
          /* Reading line still above the first block (inside the intro):
             remember the exact pixel gap so it is restored, not snapped. */
          before: into < 0 ? into : 0
        };
      },

      scrollTo: function (anchor, smooth) {
        if (!anchor) return;
        if (anchor.top) {
          if (AutoScroll) AutoScroll.commit();
          window.scrollTo(0, 0);
          if (AutoScroll) AutoScroll.sync();
          return;
        }
        var node = document.getElementById(anchor.id);
        if (!node) return;
        if (AutoScroll) AutoScroll.commit();
        Metrics.refresh();
        var y = offsetTop(node) + (node.offsetHeight || 0) * anchor.ratio
                + (anchor.before || 0) - Metrics.winHeight * 0.3;
        y = clamp(y, 0, Metrics.maxScroll);
        if (smooth) window.scrollTo({ top: y, behavior: 'smooth' });
        else window.scrollTo(0, y);
        if (AutoScroll) AutoScroll.sync();
      },

      keep: function (mutate) {
        if (AutoScroll) AutoScroll.commit();
        var anchor = this.current(window.scrollY);
        mutate();
        void document.documentElement.offsetHeight;
        Metrics.refresh();
        this.scrollTo(anchor, false);
      }
    };

    /* -------------------------------------------------------------------- */
    /* Theme & Accent                                                        */
    /* -------------------------------------------------------------------- */

    function applyAccent(value, save) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      value = value.toLowerCase();
      var dark = el.root.getAttribute('data-theme') === 'dark';
      var rgb = [1, 3, 5].map(function (index) { return parseInt(value.slice(index, index + 2), 16); });
      if (dark && value === '#007aff') rgb = [10, 132, 255];
      function luminance(channels) {
        var linear = channels.map(function (part) {
          var v = part / 255;
          return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      }
      var surface = dark ? 0.012 : 1;
      function ratio(lum) { return (Math.max(lum, surface) + 0.05) / (Math.min(lum, surface) + 0.05); }
      for (var attempt = 0; attempt < 25 && ratio(luminance(rgb)) < 4.5; attempt++) {
        rgb = rgb.map(function (part) { return Math.round(part * 0.88 + (dark ? 255 : 0) * 0.12); });
      }
      var tint = '#' + rgb.map(function (part) { return part.toString(16).padStart(2, '0'); }).join('');
      el.root.style.setProperty('--ios-tint', tint);
      el.root.style.setProperty('--ios-on-tint', luminance(rgb) > 0.179 ? '#000000' : '#ffffff');
      el.accentColor.value = value;

      if (el.accentSwatches) {
        var swatches = el.accentSwatches.querySelectorAll('[data-color]');
        for (var i = 0; i < swatches.length; i++) {
          var on = swatches[i].dataset.color.toLowerCase() === value;
          swatches[i].classList.toggle('is-active', on);
          swatches[i].setAttribute('aria-pressed', String(on));
        }
      }
      if (save) Prefs.set('accentColor', value);
    }

    var Theme = {
      names: {
        'system': 'تلقائي حسب الجهاز',
        'warm-paper': 'ورق دافئ',
        'modern-light': 'أبيض حديث',
        'sepia': 'سبيا',
        'dark': 'ليلي داكن',
        'blue-gray': 'رمادي أزرق'
      },

      apply: function (name, announce) {
        if (THEMES.indexOf(name) === -1) name = 'modern-light';
        var effective = name === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'modern-light')
          : name;
        el.root.setAttribute('data-theme', effective);
        if (el.metaTheme) {
          /* Match the browser bar to what is actually painted behind it
             (on phones that is the reading surface, not --bg). */
          var token = window.matchMedia('(max-width: 650px)').matches ? '--surface' : '--bg';
          var painted = getComputedStyle(el.root).getPropertyValue(token).trim();
          el.metaTheme.setAttribute('content', painted || THEME_COLORS[effective]);
        }
        if (el.metaStatus) el.metaStatus.setAttribute('content', effective === 'dark' ? 'black-translucent' : 'default');

        Prefs.data.theme = name;
        if (name !== 'dark' && name !== 'system') Prefs.data.lightTheme = name;
        Prefs.save();
        applyAccent(Prefs.data.accentColor, false);

        var buttons = el.themeGroup.querySelectorAll('[data-theme]');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].setAttribute('aria-checked', String(buttons[i].dataset.theme === name));
        }
        var dark = effective === 'dark';
        el.btnDark.setAttribute('aria-pressed', String(dark));
        el.btnDark.setAttribute('aria-label', dark ? 'إيقاف الوضع الليلي' : 'تفعيل الوضع الليلي');

        if (announce) Announce.say('السمة: ' + this.names[name], false);
      },

      toggleDark: function () {
        var next = el.root.getAttribute('data-theme') === 'dark'
          ? (Prefs.data.lightTheme || 'modern-light')
          : 'dark';
        this.apply(next, true);
        Announce.say('السمة: ' + this.names[next], true);
      },

      cycle: function () {
        var i = THEMES.indexOf(Prefs.data.theme);
        this.apply(THEMES[(i + 1) % THEMES.length], true);
      }
    };

    /* -------------------------------------------------------------------- */
    /* TypeScale — font size, line spacing, and column width                 */
    /* -------------------------------------------------------------------- */

    var TypeScale = {
      updateSliderFill: function (percent) {
        var min = Number(el.sizeSlider.min) || 75;
        var max = Number(el.sizeSlider.max) || 180;
        var pct = clamp(((percent - min) / (max - min)) * 100, 0, 100);
        el.root.style.setProperty('--slider-pct', pct.toFixed(1) + '%');
      },

      applySize: function (scale, announce, pin, skipKashida) {
        scale = clamp(Math.round(scale * 1000) / 1000, SIZE_MIN, SIZE_MAX);
        var mutate = function () {
          el.root.style.setProperty('--fs-scale', scale);
          Prefs.set('fontScale', scale);
        };
        pin === false ? mutate() : Anchor.keep(mutate);
        if (pin === false) Metrics.refresh();

        if (!skipKashida) Kashida.schedule();
        var percent = Math.round(scale * 100);
        el.sizeValue.textContent = percent + '%';
        el.sizeSlider.value = String(percent);
        el.sizeSlider.setAttribute('aria-valuetext', percent + ' بالمئة');
        this.updateSliderFill(percent);
        requestAnimationFrame(function () { updateReadingProgress(); });
        el.sizeDown.disabled = el.btnSmaller.disabled = scale <= SIZE_MIN + 0.001;
        el.sizeUp.disabled = el.btnLarger.disabled = scale >= SIZE_MAX - 0.001;
        if (announce) Announce.say('حجم الخط ' + percent + '٪', false);
      },

      nudge: function (direction) {
        this.applySize((Prefs.data.fontScale || 1) + direction * SIZE_STEP, true);
      },

      applyWidth: function (value, announce, pin) {
        value = Number(value);
        if (WIDTHS.indexOf(value) === -1) value = 40;

        var mutate = function () {
          el.root.style.setProperty('--measure', value + 'rem');
          Prefs.set('measure', value);
        };
        pin === false ? mutate() : Anchor.keep(mutate);
        if (pin === false) Metrics.refresh();

        Kashida.schedule();
        var options = el.widthGroup.querySelectorAll('[data-width]');
        for (var i = 0; i < options.length; i++) {
          var on = Number(options[i].dataset.width) === value;
          options[i].setAttribute('aria-checked', String(on));
          if (on && announce) Announce.say('عرض القراءة: ' + options[i].textContent.trim(), false);
        }
      },

      applyLead: function (value, announce, pin) {
        value = Number(value) || 2.1;
        var mutate = function () {
          el.root.style.setProperty('--lh', value);
          Prefs.set('lineHeight', value);
        };
        pin === false ? mutate() : Anchor.keep(mutate);
        if (pin === false) Metrics.refresh();

        Kashida.schedule();
        var options = el.leadGroup.querySelectorAll('[data-lh]');
        for (var i = 0; i < options.length; i++) {
          var on = Math.abs(Number(options[i].dataset.lh) - value) < 0.01;
          options[i].setAttribute('aria-checked', String(on));
          if (on && announce) Announce.say('تباعد الأسطر: ' + options[i].textContent.trim(), false);
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* AutoScroll — GPU-Composited Sub-Pixel Engine (60Hz / 120Hz Mobile)   */
    /* -------------------------------------------------------------------- */
    /* Why mobile browsers stutter with `window.scrollTo(0, virtualY)`:
         1. iOS Safari & Chrome Android quantize `window.scrollTo` to integer
            pixels (1px steps), so at ~0.18px/frame the text freezes for 5–6
            frames then jumps 1px.
         2. Calling `scrollTo` every frame triggers main-thread scroll listeners,
            toolbar address-bar heuristics, and expensive backdrop-filter repaints.
       Solution:
         During active auto-scroll, `window.scrollY` stays anchored at `baseY`
         while `el.reader` glides on the GPU compositor with floating-point
         sub-pixel precision via `translate3d(0, -offset, 0)`. Whenever the
         user touches the screen, wheels, pauses, or opens settings, `commit()`
         synchronously flushes `virtualY` to `window.scrollTo(0, targetY)` and
         clears the transform in the same frame with zero visual jump.        */

    var RESUME_DELAY = 1200;
    var RAMP_TIME = 0.75;

    function appleEaseInOut(t) {
      return t * t * (3 - 2 * t);
    }

    var AutoScroll = {
      running: false,
      parked: false,
      raf: 0,
      lastFrame: 0,
      smoothDt: 1 / 60,
      ramp: 0,
      currentVel: 0,
      baseY: 0,
      offset: 0,
      virtualY: 0,
      lastApplied: -1,
      lastScrollCallAt: 0,
      lastProgressSaveAt: 0,
      resumeTimer: 0,
      tapPaused: false,   /* paused by a tap on the text; the next tap resumes */

      velocity: function () {
        var BASE_LINES_PER_MINUTE = 15.5;
        var linesPerMinute = BASE_LINES_PER_MINUTE * Prefs.data.speed;
        return Metrics.lineHeight * linesPerMinute / 60;
      },

      /** Flush the sub-pixel GPU transform offset back into native `window.scrollY`
          in a single synchronous frame (zero visual jump). */
      commit: function () {
        if (this.offset === 0 && !el.reader.style.transform) {
          this.baseY = window.scrollY;
          this.virtualY = window.scrollY;
          return;
        }
        var targetY = clamp(Math.round(this.virtualY), 0, Metrics.maxScroll);
        el.reader.style.transform = '';
        this.offset = 0;
        this.baseY = targetY;
        this.virtualY = targetY;
        this.lastScrollCallAt = performance.now();
        if (Math.abs(window.scrollY - targetY) >= 1) {
          window.scrollTo(0, targetY);
        }
        this.lastApplied = window.scrollY;
      },

      start: function (announce) {
        if (this.running) return;
        this.tapPaused = false;
        if (Voice.active) Voice.stop(false);
        Metrics.refresh();
        if (window.scrollY >= Metrics.maxScroll - 2) {
          window.scrollTo(0, 0);
        }
        this.running = true;
        this.parked = false;
        this.ramp = 0;
        this.currentVel = 0;
        this.baseY = window.scrollY;
        this.offset = 0;
        this.virtualY = window.scrollY;
        this.lastApplied = window.scrollY;
        this.lastFrame = 0;
        this.smoothDt = 1 / 60;
        el.reader.style.transform = 'translate3d(0, 0px, 0)';
        el.body.classList.add('is-autoscrolling');
        this.raf = requestAnimationFrame(this.tick);
        this.reflect();
        /* Make sure the dock is visible when playback starts, even if the bars
           were hidden by scrolling; they auto-hide again after IDLE_HIDE. */
        Chrome.poke();
        Prefs.set('autoScroll', true);
        if (announce) Announce.say('التمرير التلقائي قيد التشغيل', true);
      },

      stop: function (announce, reason) {
        this.tapPaused = false;
        if (!this.running) return;
        this.commit();
        this.running = false;
        this.parked = false;
        this.currentVel = 0;
        el.body.classList.remove('is-autoscrolling');
        cancelAnimationFrame(this.raf);
        clearTimeout(this.resumeTimer);
        this.reflect();
        Prefs.set('autoScroll', false);
        updateReadingProgress(window.scrollY);
        Progress.save();
        if (announce) Announce.say(reason || 'توقف التمرير التلقائي', true);
      },

      toggle: function () {
        if (this.running) this.stop(true);
        else this.start(true);
      },

      park: function () {
        if (!this.running) return;
        if (!this.parked) {
          this.commit();
        }
        this.parked = true;
        this.ramp = 0;
        this.currentVel = 0;
        el.dock.classList.add('is-parked');
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(function () {
          if (!AutoScroll.running) return;
          AutoScroll.parked = false;
          AutoScroll.baseY = window.scrollY;
          AutoScroll.offset = 0;
          AutoScroll.virtualY = window.scrollY;
          AutoScroll.lastApplied = window.scrollY;
          AutoScroll.lastFrame = 0;
          el.reader.style.transform = 'translate3d(0, 0px, 0)';
          el.dock.classList.remove('is-parked');
        }, RESUME_DELAY);
      },

      sync: function () {
        el.reader.style.transform = '';
        this.offset = 0;
        this.baseY = window.scrollY;
        this.virtualY = window.scrollY;
        this.lastApplied = window.scrollY;
        this.lastScrollCallAt = performance.now();
      },

      isForeign: function () {
        if (performance.now() - this.lastScrollCallAt < 110) return false;
        return this.lastApplied < 0 ||
               Math.abs(window.scrollY - this.baseY) > 6;
      },

      tick: function (now) {
        var self = AutoScroll;
        if (!self.running) return;

        if (!self.lastFrame) {
          self.lastFrame = now;
          self.raf = requestAnimationFrame(self.tick);
          return;
        }

        var rawDt = Math.min(0.05, Math.max(0.001, (now - self.lastFrame) / 1000));
        self.lastFrame = now;
        self.smoothDt = self.smoothDt * 0.85 + rawDt * 0.15;
        var dt = self.smoothDt;

        if (self.parked || Chrome.panelOpen) {
          if (self.offset !== 0) self.commit();
          self.baseY = window.scrollY;
          self.virtualY = window.scrollY;
          self.lastApplied = window.scrollY;
        } else if (dt > 0) {
          self.ramp = prefersReducedMotion() ? 1 : Math.min(1, self.ramp + dt / RAMP_TIME);
          var easedRamp = appleEaseInOut(self.ramp);
          var targetVel = self.velocity() * easedRamp;

          var lerpFactor = 1 - Math.exp(-12 * dt);
          self.currentVel += (targetVel - self.currentVel) * lerpFactor;
          self.virtualY += self.currentVel * dt;

          var limit = Metrics.maxScroll;
          if (self.virtualY >= limit) {
            self.virtualY = limit;
            self.commit();
            self.stop(true, 'انتهت الخطبة');
            Chrome.show();
            return;
          }

          self.offset = self.virtualY - self.baseY;
          el.reader.style.transform = 'translate3d(0, ' + (-self.offset).toFixed(3) + 'px, 0)';
          updateReadingProgress(self.virtualY);

          if (now - self.lastProgressSaveAt > 2500) {
            self.lastProgressSaveAt = now;
            Progress.save(self.virtualY);
          }
        }

        self.raf = requestAnimationFrame(self.tick);
      },

      setSpeed: function (value, announce) {
        var speed = nearestPreset(Number(value));
        Prefs.set('speed', speed);

        var label = formatSpeed(speed);
        el.dockSpeed.textContent = label;
        el.dockSlower.disabled = speed <= SPEED_PRESETS[0];
        el.dockFaster.disabled = speed >= SPEED_PRESETS[SPEED_PRESETS.length - 1];

        if (el.speedGroup) {
          var chips = el.speedGroup.querySelectorAll('.speedChip');
          for (var i = 0; i < chips.length; i++) {
            var isActive = Number(chips[i].dataset.speed) === speed;
            chips[i].setAttribute('aria-checked', String(isActive));
          }
        }

        if (announce) Announce.say('سرعة التمرير ' + label, false);
      },

      reflect: function () {
        var on = this.running;
        el.btnAuto.setAttribute('aria-pressed', String(on));
        el.btnAuto.setAttribute('aria-label',
          on ? 'إيقاف التمرير التلقائي' : 'تشغيل التمرير التلقائي');
        el.dockToggle.classList.toggle('is-playing', on);
        el.dockToggle.setAttribute('aria-label',
          on ? 'إيقاف التمرير التلقائي' : 'تشغيل التمرير التلقائي');
        el.autoToggle.checked = on;
        el.dock.hidden = !on;
        if (!on) el.dock.classList.remove('is-parked');
      }
    };

    AutoScroll.tick = AutoScroll.tick.bind(AutoScroll);

    /* -------------------------------------------------------------------- */
    /* Progress — remember reading position                                  */
    /* -------------------------------------------------------------------- */

    var Progress = {
      restoring: false,

      save: function (customY) {
        if (this.restoring) return;
        var y = typeof customY === 'number' ? customY : effectiveScrollY();
        var anchor = Anchor.current(y);
        Store.write(PROGRESS_KEY, {
          id: anchor ? anchor.id : null,
          ratio: anchor ? anchor.ratio : 0,
          fraction: Metrics.maxScroll > 0 ? y / Metrics.maxScroll : 0,
          at: Date.now()
        });
      },

      restore: function () {
        var saved = Store.read(PROGRESS_KEY, null);
        if (!saved) return;
        this.restoring = true;

        if (saved.id && document.getElementById(saved.id)) {
          Anchor.scrollTo({ id: saved.id, ratio: saved.ratio || 0 }, false);
        } else if (typeof saved.fraction === 'number') {
          window.scrollTo(0, saved.fraction * Metrics.maxScroll);
        }

        AutoScroll.sync();
        var self = this;
        setTimeout(function () { self.restoring = false; }, 120);
      },

      clear: function () { Store.remove(PROGRESS_KEY); }
    };

    /* -------------------------------------------------------------------- */
    /* Chrome — immersive mode and the Liquid Glass settings sheet           */
    /* -------------------------------------------------------------------- */

    var IDLE_HIDE = 2800;

    var Chrome = {
      hidden: false,
      idleTimer: 0,
      panelOpen: false,
      panelHideTimer: 0,

      show: function () {
        if (!this.hidden) return;
        this.hidden = false;
        el.body.classList.remove('is-immersive');
      },

      hide: function () {
        if (this.hidden || this.panelOpen) return;
        if (effectiveScrollY() < 80) return;
        if (document.activeElement && (el.toolbar.contains(document.activeElement) || el.actionbar.contains(document.activeElement))) return;
        this.hidden = true;
        el.body.classList.add('is-immersive');
      },

      toggle: function () { this.hidden ? this.show() : this.hide(); },

      poke: function () {
        this.show();
        clearTimeout(this.idleTimer);
        var self = this;
        this.idleTimer = setTimeout(function () {
          if (AutoScroll.running && !AutoScroll.parked) self.hide();
        }, IDLE_HIDE);
      },

      openPanel: function () {
        if (AutoScroll.running) AutoScroll.commit();
        this.panelOpen = true;
        this.show();
        clearTimeout(this.panelHideTimer);
        el.panel.hidden = false;
        el.scrim.hidden = false;
        [el.reader, el.toolbar, el.dock, el.actionbar].forEach(function (node) {
          if (node) node.inert = true;
        });
        requestAnimationFrame(function () {
          el.panel.classList.add('is-open');
          el.scrim.classList.add('is-open');
        });
        el.btnPanel.setAttribute('aria-expanded', 'true');
        el.btnPanelClose.focus();
      },

      closePanel: function (returnFocus) {
        if (!this.panelOpen) return;
        this.panelOpen = false;
        [el.reader, el.toolbar, el.dock, el.actionbar].forEach(function (node) {
          if (node) node.inert = false;
        });
        el.panel.classList.remove('is-open');
        el.panel.classList.remove('is-expanded');
        el.scrim.classList.remove('is-open');
        el.btnPanel.setAttribute('aria-expanded', 'false');
        if (AutoScroll.running) {
          AutoScroll.baseY = window.scrollY;
          AutoScroll.offset = 0;
          AutoScroll.virtualY = window.scrollY;
          AutoScroll.lastFrame = 0;
        }
        this.panelHideTimer = setTimeout(function () {
          el.panel.hidden = true;
          el.scrim.hidden = true;
        }, 360);
        if (returnFocus) el.btnPanel.focus();
      },

      togglePanel: function () {
        this.panelOpen ? this.closePanel(true) : this.openPanel();
      }
    };

    /* -------------------------------------------------------------------- */
    /* LowData — Reduced Transparency & Battery Mode                         */
    /* -------------------------------------------------------------------- */

    var LowData = {
      on: false,

      detect: function () {
        var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn && conn.saveData === true) return true;
        return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
      },

      apply: function (on, announce) {
        this.on = !!on;

        if (this.on) el.root.setAttribute('data-lowdata', 'on');
        else el.root.removeAttribute('data-lowdata');

        Prefs.set('lowData', this.on);
        if (el.lowDataToggle) el.lowDataToggle.checked = this.on;

        if (announce) {
          Announce.say(this.on ? 'تم تفعيل تقليل الشفافية' : 'تم تفعيل شفافية Liquid Glass الكاملة', true);
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* Kashida — Arabic elongation justification (Preserves Quranic Script)  */
    /* -------------------------------------------------------------------- */

    var TATWEEL = '\u0640';
    var TATWEEL_RE = /\u0640/g;
    var KASHIDA_LEVELS = { off: 0, low: 0.35, medium: 0.68, high: 0.92 };
    var NO_FORWARD_JOIN = '\u0627\u0623\u0625\u0622\u0671\u062f\u0630\u0631\u0632\u0648\u0624\u0629\u0649\u0621';

    function isDiacritic(ch) {
      var c = ch.charCodeAt(0);
      return (c >= 0x0610 && c <= 0x061a) ||
             (c >= 0x064b && c <= 0x065f) ||
             c === 0x0670 ||
             (c >= 0x06d6 && c <= 0x06ed);
    }

    function isArabicLetter(ch) {
      var c = ch.charCodeAt(0);
      /* U+0640 (tatweel) sits inside this range; it is not a letter. Counting it
         made every inserted tatweel a new insertion point, so elongations stacked
         at one joint ("تاريـــخ") instead of spreading across the line. */
      return c >= 0x0621 && c <= 0x064a && c !== 0x0640;
    }

    var Kashida = {
      level: 'medium',
      timer: 0,
      originals: [],
      running: false,

      blocks: function () {
        return el.sheet.querySelectorAll('.doc-body');
      },

      capture: function () {
        this.originals = [];
        var blocks = this.blocks();
        for (var i = 0; i < blocks.length; i++) {
          this.originals.push({ node: blocks[i], html: blocks[i].innerHTML });
        }
      },

      restore: function () {
        for (var i = 0; i < this.originals.length; i++) {
          this.originals[i].node.innerHTML = this.originals[i].html;
        }
      },

      setLevel: function (level, announce) {
        if (!KASHIDA_LEVELS.hasOwnProperty(level)) level = 'medium';
        this.level = level;
        Prefs.set('kashida', level);

        if (el.kashidaGroup) {
          var opts = el.kashidaGroup.querySelectorAll('[data-kashida]');
          for (var i = 0; i < opts.length; i++) {
            var on = opts[i].dataset.kashida === level;
            opts[i].setAttribute('aria-checked', String(on));
            if (on && announce) Announce.say('الكشيدة: ' + opts[i].textContent.trim(), false);
          }
        }
        this.schedule(0);
      },

      schedule: function (delay) {
        var self = this;
        clearTimeout(this.timer);
        this.timer = setTimeout(function () { self.run(); },
                                delay === undefined ? 220 : delay);
      },

      wrap: function (block) {
        var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) {
          var curr = walker.currentNode;
          if (curr.parentElement && curr.parentElement.closest('.r-quran, .ayah')) continue;
          nodes.push(curr);
        }

        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var text = node.nodeValue;
          if (!text || !text.trim()) continue;

          var frag = document.createDocumentFragment();
          var parts = text.split(/(\s+)/);
          for (var j = 0; j < parts.length; j++) {
            if (!parts[j]) continue;
            if (/^\s+$/.test(parts[j])) {
              frag.appendChild(document.createTextNode(parts[j]));
            } else {
              var span = document.createElement('span');
              span.className = 'kw';
              span.textContent = parts[j];
              frag.appendChild(span);
            }
          }
          node.parentNode.replaceChild(frag, node);
        }
      },

      unwrap: function (block) {
        var spans = block.querySelectorAll('.kw');
        for (var i = 0; i < spans.length; i++) {
          var span = spans[i];
          span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
        }
        block.normalize();
      },

      spots: function (word) {
        var out = [];
        for (var i = 0; i < word.length - 1; i++) {
          var ch = word.charAt(i);
          if (isDiacritic(ch) || ch === TATWEEL) continue;
          if (!isArabicLetter(ch)) continue;
          if (NO_FORWARD_JOIN.indexOf(ch) !== -1) continue;

          var j = i + 1;
          while (j < word.length && isDiacritic(word.charAt(j))) j++;
          if (j >= word.length) break;
          var next = word.charAt(j);
          if (!isArabicLetter(next) || next === '\u0621') continue;
          out.push(j);
        }
        return out;
      },

      unitWidth: function () {
        var probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;';
        probe.textContent = new Array(21).join(TATWEEL);
        el.sheet.appendChild(probe);
        var w = probe.getBoundingClientRect().width / 20;
        probe.parentNode.removeChild(probe);
        return w || 4;
      },

      run: function () {
        if (this.running) return;
        if (!this.originals.length) this.capture();
        this.running = true;

        var self = this;
        Anchor.keep(function () {
          self.restore();

          if (!KASHIDA_LEVELS[self.level]) { self.running = false; return; }
          var ratio = KASHIDA_LEVELS[self.level];

          el.sheet.classList.add('is-measuring');
          var unit = self.unitWidth();
          var blocks = self.blocks();

          for (var b = 0; b < blocks.length; b++) self.wrap(blocks[b]);

          for (var pass = 0; pass < 2; pass++) {
            for (var k = 0; k < blocks.length; k++) {
              self.fill(blocks[k], unit, ratio);
            }
          }

          for (var u = 0; u < blocks.length; u++) self.unwrap(blocks[u]);
          el.sheet.classList.remove('is-measuring');
          self.running = false;
        });
        Metrics.refresh();
      },

      fill: function (block, unit, ratio) {
        var spans = block.querySelectorAll('.kw');
        if (!spans.length) return;

        var breakAfter = {};
        var order = [];
        var walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT, null);
        while (walker.nextNode()) {
          var node = walker.currentNode;
          if (node.classList && node.classList.contains('kw')) order.push(node);
          else if (node.tagName === 'BR' && order.length) {
            breakAfter[order.length - 1] = true;
          }
        }

        var width = block.clientWidth;
        var lines = [];
        var current = null;

        for (var i = 0; i < order.length; i++) {
          var top = order[i].offsetTop;
          if (!current || Math.abs(top - current.top) > 2) {
            current = { top: top, words: [], left: Infinity, right: -Infinity, ends: false };
            lines.push(current);
          }
          current.words.push(order[i]);
          if (breakAfter[i]) current.ends = true;
          var l = order[i].offsetLeft;
          var r = l + order[i].offsetWidth;
          if (l < current.left) current.left = l;
          if (r > current.right) current.right = r;
        }

        for (var n = 0; n < lines.length - 1; n++) {
          var line = lines[n];
          if (line.ends) continue;
          var need = (width - (line.right - line.left)) * ratio;
          if (need < unit) continue;

          var slots = Math.floor(need / unit);
          if (slots < 1) continue;

          var candidates = [];
          for (var w = 0; w < line.words.length; w++) {
            var span = line.words[w];
            var positions = this.spots(span.textContent);
            if (positions.length) {
              candidates.push({ span: span, pos: positions, len: span.textContent.length });
            }
          }
          if (!candidates.length) continue;
          candidates.sort(function (a, b) { return b.len - a.len; });

          /* Round-robin over the line's longest words: at most two elongations
             per word, each at a different joint, so the stretch reads as even
             texture rather than one dramatic gap. */
          var MAX_PER_WORD = 2;
          var placed = 0, guard = 0;
          while (placed < slots && guard < slots * 4) {
            var moved = false;
            for (var c = 0; c < candidates.length && placed < slots; c++) {
              var cand = candidates[c];
              cand.added = cand.added || 0;
              if (cand.added >= MAX_PER_WORD || !cand.pos.length) continue;
              var text = cand.span.textContent;
              var at = cand.pos[cand.pos.length - 1];
              cand.span.textContent = text.slice(0, at) + TATWEEL + text.slice(at);
              cand.pos = this.spots(cand.span.textContent);
              cand.added++;
              placed++;
              moved = true;
            }
            if (!moved) break;
            guard++;
          }
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* Fullscreen                                                            */
    /* -------------------------------------------------------------------- */

    var Fullscreen = {
      supported: function () {
        var e = document.documentElement;
        return !!(e.requestFullscreen || e.webkitRequestFullscreen);
      },

      active: function () {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
      },

      enter: function () {
        var e = document.documentElement;
        var request = e.requestFullscreen || e.webkitRequestFullscreen;
        if (!request) return Promise.resolve();
        return Promise.resolve(request.call(e))['catch'](function () {});
      },

      exit: function () {
        var request = document.exitFullscreen || document.webkitExitFullscreen;
        if (!request) return Promise.resolve();
        return Promise.resolve(request.call(document))['catch'](function () {});
      },

      toggle: function () {
        this.active() ? this.exit() : this.enter();
      },

      reflect: function () {
        var on = this.active();
        if (el.btnFull) {
          el.btnFull.setAttribute('aria-pressed', String(on));
          el.btnFull.setAttribute('aria-label', on ? 'إنهاء ملء الشاشة' : 'ملء الشاشة');
        }
        if (el.fullToggle) el.fullToggle.checked = on;
        /* Not persisted: browsers only allow fullscreen from a user gesture,
           so a saved "on" could never be restored on the next visit. */
      }
    };

    /* -------------------------------------------------------------------- */
    /* Reset Dialog (Liquid Glass Alert Modal)                               */
    /* -------------------------------------------------------------------- */

    var ResetDialog = {
      isOpen: function () { return !!el.resetAlert && !el.resetAlert.hidden; },

      open: function () {
        if (!el.resetAlert) return;
        el.resetAlert.hidden = false;
        el.panel.inert = true; /* keep Tab inside the alert */
        requestAnimationFrame(function () {
          el.resetAlert.classList.add('is-open');
        });
        el.btnResetCancel.focus();
      },

      close: function (returnFocus) {
        if (!this.isOpen()) return;
        el.resetAlert.classList.remove('is-open');
        el.panel.inert = false;
        setTimeout(function () {
          el.resetAlert.hidden = true;
        }, 220);
        if (returnFocus !== false) el.btnReset.focus();
      },

      confirm: function () {
        AutoScroll.stop(false);
        Store.remove(PREFS_KEY);
        Progress.clear();
        Prefs.load();
        applyStoredPrefs();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        this.close(false);
        /* The panel is closing, so return focus to the button that opened it
           (previously focus landed on a hidden element and was lost). */
        Chrome.closePanel(true);
        Announce.say('تمت استعادة الإعدادات الافتراضية', true);
      }
    };

    /* -------------------------------------------------------------------- */
    /* Clipboard Fallback Helper                                             */
    /* -------------------------------------------------------------------- */

    function copyTextToClipboard(text, successMsg) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          Announce.say(successMsg, true);
        }, function () {
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
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        Announce.say(successMsg, true);
      } catch (e) {
        Announce.say('تعذّر النسخ إلى الحافظة', true);
      }
    }

    /* -------------------------------------------------------------------- */
    /* Keyboard Shortcuts                                                    */
    /* -------------------------------------------------------------------- */

    var Keys = {
      handle: function (event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        var tag = (event.target.tagName || '').toLowerCase();
        var typing = tag === 'textarea' || event.target.isContentEditable ||
          (tag === 'input' && !/^(checkbox|radio|range|color|button)$/.test(event.target.type));

        if (event.key === 'Escape') {
          if (ResetDialog.isOpen()) {
            ResetDialog.close();
            return;
          }
          Chrome.closePanel(true);
          return;
        }

        if (event.key === 'Tab' && ResetDialog.isOpen()) {
          var first = el.btnResetCancel, last = el.btnResetConfirm;
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          else if (!el.resetAlert.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
          return;
        }
        if (typing || ResetDialog.isOpen()) return;

        /* Letter shortcuts use the physical key (event.code) so they also work
           with an Arabic keyboard layout, where the A key types "ش". */
        switch (event.code) {
          case 'KeyA': AutoScroll.toggle(); event.preventDefault(); return;
          case 'KeyT': Theme.cycle(); event.preventDefault(); return;
          case 'KeyD': Theme.toggleDark(); event.preventDefault(); return;
          case 'KeyF':
            if (Fullscreen.supported()) { Fullscreen.toggle(); event.preventDefault(); }
            return;
        }

        switch (event.key) {
          case '+': case '=':
            TypeScale.nudge(1); event.preventDefault(); break;
          case '-': case '_':
            TypeScale.nudge(-1); event.preventDefault(); break;
          case '?': case '؟':
            Chrome.togglePanel(); event.preventDefault(); break;
          case 'ArrowUp':
            if (event.shiftKey) { AutoScroll.setSpeed(stepPreset(Prefs.data.speed, 1), true); event.preventDefault(); }
            break;
          case 'ArrowDown':
            if (event.shiftKey) { AutoScroll.setSpeed(stepPreset(Prefs.data.speed, -1), true); event.preventDefault(); }
            break;
        }
      }
    };

    /* -------------------------------------------------------------------- */
    /* Wiring & Event Listeners                                              */
    /* -------------------------------------------------------------------- */

    function prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function isChromeTarget(target) {
      return !!(target && target.closest &&
        target.closest('.toolbar, .reader-actionbar, .dock, .panel, .scrim, .alert-backdrop, .skip-link'));
    }

    /* -------------------------------------------------------------------- */
    /* Voice Follow — listens to the khateeb and highlights what was said   */
    /* -------------------------------------------------------------------- */
    /* Speech is turned into text by the browser (Chrome: Google, Safari: Apple)
       and matched against the khutbah word by word, ignoring diacritics,
       tatweel and hamza forms. The current word and sentence are painted with
       the CSS Custom Highlight API, so the text itself (and the kashida engine
       that rewrites it) is never touched. */

    var VOICE_LANGS = ['ar-SA', 'ar-MA', 'ar'];

    function voiceNorm(word) {
      return String(word)
        .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
        .replace(/[آأإٱٲٳ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ئ/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ة/g, 'ه')
        .replace(/ڢ/g, 'ف')
        .replace(/ڧ/g, 'ق')
        .replace(/ں/g, 'ن')
        .replace(/[^ء-ي]/g, '');
    }

    function voiceSim(a, b) {
      if (a === b) return 1;
      var la = a.length, lb = b.length;
      if (!la || !lb) return 0;
      var prev = [], cur = [], i, j;
      for (j = 0; j <= lb; j++) prev[j] = j;
      for (i = 1; i <= la; i++) {
        cur = [i];
        for (j = 1; j <= lb; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                            prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        }
        prev = cur;
      }
      return 1 - prev[lb] / Math.max(la, lb);
    }

    var Voice = {
      active: false,
      rec: null,
      langIndex: 0,
      words: [],          /* { node, start, end, norm, sentence } */
      dirty: true,
      pos: -1,            /* index of the last word the khateeb said */
      locked: false,      /* false until the first confident match */
      lastScroll: 0,
      restartTimer: 0,
      wakeLock: null,
      observer: null,

      supported: function () {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      },

      /* Build the word list from the khutbah text nodes (footnote markers skipped). */
      index: function () {
        var words = [];
        var sentence = 0;
        var blocks = el.sheet.querySelectorAll('.doc-body');
        for (var b = 0; b < blocks.length; b++) {
          var walker = document.createTreeWalker(blocks[b], NodeFilter.SHOW_TEXT, null);
          while (walker.nextNode()) {
            var node = walker.currentNode;
            if (node.parentElement && node.parentElement.closest('sup, .r-ref')) continue;
            var text = node.nodeValue;
            var re = /\S+/g, m;
            while ((m = re.exec(text))) {
              var n = voiceNorm(m[0]);
              if (!n) {
                if (/[.؟?!:؛،]/.test(m[0]) && words.length) sentence++;
                continue;
              }
              words.push({ node: node, start: m.index, end: m.index + m[0].length, norm: n, sentence: sentence });
              if (/[.؟?!:؛،]/.test(m[0])) sentence++;
            }
          }
          sentence++;
        }
        this.words = words;
        this.dirty = false;
      },

      ensureIndex: function () {
        if (this.dirty || !this.words.length ||
            (this.words[0] && !el.sheet.contains(this.words[0].node))) {
          this.index();
        }
      },

      watchText: function () {
        if (this.observer || !window.MutationObserver) return;
        var self = this;
        /* Kashida rewrites the paragraphs; re-index and repaint after it does. */
        this.observer = new MutationObserver(function (records) {
          var textChanged = false;
          for (var i = 0; i < records.length; i++) {
            if (!self.layer || !self.layer.contains(records[i].target)) { textChanged = true; break; }
          }
          if (!textChanged) return;
          self.dirty = true;
          if (self.active) {
            requestAnimationFrame(function () { self.ensureIndex(); self.paint(false); });
          }
        });
        this.observer.observe(el.sheet, { childList: true, subtree: true, characterData: true });
      },

      rangeFor: function (w) {
        var r = document.createRange();
        r.setStart(w.node, w.start);
        r.setEnd(w.node, Math.min(w.end, w.node.nodeValue.length));
        return r;
      },

      paint: function (scroll) {
        if (!this.words.length || this.pos < 0) { this.clearPaint(); return; }
        var w = this.words[Math.min(this.pos, this.words.length - 1)];
        if (!el.sheet.contains(w.node)) return;

        var a = this.pos, z = this.pos;
        while (a > 0 && this.words[a - 1].sentence === w.sentence) a--;
        while (z < this.words.length - 1 && this.words[z + 1].sentence === w.sentence) z++;
        var clause = document.createRange();
        clause.setStart(this.words[a].node, this.words[a].start);
        clause.setEnd(this.words[z].node, Math.min(this.words[z].end, this.words[z].node.nodeValue.length));

        if (window.CSS && CSS.highlights && window.Highlight) {
          CSS.highlights.set('voice-sentence', new Highlight(clause));
          CSS.highlights.set('voice-word', new Highlight(this.rangeFor(w)));
        } else {
          this.paintLayer(clause, this.rangeFor(w));
        }
        if (scroll !== false) this.follow(w);
      },

      clearPaint: function () {
        if (window.CSS && CSS.highlights) {
          CSS.highlights.delete('voice-word');
          CSS.highlights.delete('voice-sentence');
        }
        if (this.layer) this.layer.innerHTML = '';
      },

      /* Older Safari (iOS 15, e.g. iPhone 7) has no CSS Highlight API: draw the
         same highlight as boxes in a layer placed behind the text inside the
         sheet. The text itself is still never modified. */
      layer: null,

      paintLayer: function (clause, word) {
        if (!this.layer) {
          this.layer = document.createElement('div');
          this.layer.className = 'voice-layer';
          this.layer.setAttribute('aria-hidden', 'true');
          el.sheet.classList.add('has-voice-layer');
          el.sheet.insertBefore(this.layer, el.sheet.firstChild);
        }
        var origin = el.sheet.getBoundingClientRect();
        var ox = origin.left + el.sheet.clientLeft;
        var oy = origin.top + el.sheet.clientTop;
        var html = '';
        var add = function (range, cls) {
          var rects = range.getClientRects();
          for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            if (r.width < 1 || r.height < 1) continue;
            html += '<span class="' + cls + '" style="left:' + (r.left - ox).toFixed(1) +
                    'px;top:' + (r.top - oy).toFixed(1) + 'px;width:' + r.width.toFixed(1) +
                    'px;height:' + r.height.toFixed(1) + 'px"></span>';
          }
        };
        add(clause, 'voice-layer__clause');
        add(word, 'voice-layer__word');
        this.layer.innerHTML = html;
      },

      /* Keep the current word around the upper third of the screen. */
      follow: function (w) {
        var now = Date.now();
        if (now - this.lastScroll < 350) return;
        var rect = this.rangeFor(w).getBoundingClientRect();
        var vh = window.innerHeight;
        if (rect.top < vh * 0.22 || rect.bottom > vh * 0.58) {
          this.lastScroll = now;
          window.scrollTo({ top: window.scrollY + rect.top - vh * 0.36, behavior: 'smooth' });
        }
      },

      /* Index of the first word visible below the top bar. */
      firstVisible: function () {
        var limit = el.toolbar ? el.toolbar.getBoundingClientRect().bottom : 0;
        for (var i = 0; i < this.words.length; i++) {
          var r = this.rangeFor(this.words[i]).getBoundingClientRect();
          if (r.bottom > limit + 4 && r.height) return i;
        }
        return 0;
      },

      /* Local alignment of the last spoken words against the text near `pos`. */
      match: function (transcript) {
        this.ensureIndex();
        var heard = transcript.split(/\s+/).map(voiceNorm).filter(Boolean);
        if (!heard.length) return;
        var tail = heard.slice(-8);
        var k = tail.length;

        var from = Math.max(0, this.pos - (this.locked ? 15 : 0));
        var to = Math.min(this.words.length, this.pos + 1 + (this.locked ? 80 : 220));
        if (to <= from) return;

        var H = [], i, j;
        for (i = 0; i <= k; i++) { H[i] = []; for (j = 0; j <= to - from; j++) H[i][j] = 0; }
        var best = 0, bestJ = -1;
        for (i = 1; i <= k; i++) {
          for (j = 1; j <= to - from; j++) {
            var s = voiceSim(tail[i - 1], this.words[from + j - 1].norm);
            var gain = s >= 0.84 ? (tail[i - 1].length > 2 ? 3 : 1.5) : (s >= 0.66 ? 1.5 : -1);
            H[i][j] = Math.max(0, H[i - 1][j - 1] + gain, H[i - 1][j] - 1, H[i][j - 1] - 1);
            if (i >= k - 1) {
              var idx = from + j - 1;
              var d = idx - this.pos;
              var penalty = d < 0 ? 0.4 * -d : 0.03 * Math.max(0, d - 4);
              var score = H[i][j] - penalty - (i < k ? 1 : 0);
              if (score > best) { best = score; bestJ = idx; }
            }
          }
        }

        var need = this.locked ? 4.5 : 6;
        if (bestJ < 0 || best < need) return;
        if (bestJ < this.pos && best < 7) return;
        if (bestJ === this.pos) return;
        this.pos = bestJ;
        this.locked = true;
        this.paint(true);
      },

      onResult: function (event) {
        var text = '';
        for (var i = 0; i < event.results.length; i++) {
          text += ' ' + event.results[i][0].transcript;
        }
        this.match(text);
      },

      onError: function (event) {
        var e = event && event.error;
        if (e === 'no-speech' || e === 'aborted') return;
        if (e === 'language-not-supported' && this.langIndex < VOICE_LANGS.length - 1) {
          this.langIndex++;
          return;
        }
        var msg = 'تعذّر تشغيل المتابعة الصوتية';
        if (e === 'not-allowed') msg = 'اسمح للتطبيق باستعمال الميكروفون ثم أعد المحاولة';
        if (e === 'service-not-allowed') {
          msg = window.navigator.standalone
            ? 'على iPhone افتح الخطبة في Safari لتعمل المتابعة الصوتية'
            : 'فعّل Siri والإملاء في إعدادات iPhone ثم أعد المحاولة';
        }
        if (e === 'network') msg = 'المتابعة الصوتية تحتاج اتصالًا بالإنترنت';
        if (e === 'audio-capture') msg = 'لم يُعثر على ميكروفون';
        this.stop(false);
        Announce.say(msg, true);
      },

      listen: function () {
        var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        var self = this;
        var rec = new Rec();
        rec.lang = VOICE_LANGS[this.langIndex];
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) { self.onResult(e); };
        rec.onerror = function (e) { self.onError(e); };
        rec.onend = function () {
          /* Browsers end a session after silence or ~1 minute: start a new one. */
          if (self.active && self.rec === rec) {
            clearTimeout(self.restartTimer);
            self.restartTimer = setTimeout(function () { if (self.active) self.listen(); }, 200);
          }
        };
        this.rec = rec;
        try { rec.start(); } catch (err) { /* already started */ }
      },

      keepAwake: function () {
        var self = this;
        if (!('wakeLock' in navigator) || this.wakeLock) return;
        navigator.wakeLock.request('screen').then(function (lock) {
          self.wakeLock = lock;
          lock.addEventListener('release', function () { self.wakeLock = null; });
        }).catch(function () {});
      },

      start: function () {
        if (this.active) return;
        if (!this.supported()) {
          Announce.say('المتابعة الصوتية غير مدعومة في هذا المتصفح — استعمل Chrome أو Safari', true);
          return;
        }
        if (AutoScroll.running) AutoScroll.stop(false);
        AutoScroll.tapPaused = false;
        this.watchText();
        this.index();
        this.pos = this.firstVisible() - 1;
        this.locked = false;
        this.active = true;
        this.langIndex = 0;
        el.body.classList.add('is-voice');
        this.sync();
        this.keepAwake();
        this.listen();
        Announce.say('المتابعة الصوتية تعمل — ابدأ القراءة', true);
      },

      stop: function (announce) {
        if (!this.active) return;
        this.active = false;
        clearTimeout(this.restartTimer);
        var rec = this.rec;
        this.rec = null;
        if (rec) { try { rec.abort(); } catch (err) {} }
        if (this.wakeLock) { this.wakeLock.release().catch(function () {}); this.wakeLock = null; }
        this.clearPaint();
        el.body.classList.remove('is-voice');
        this.sync();
        if (announce !== false) Announce.say('توقفت المتابعة الصوتية', true);
      },

      toggle: function () { this.active ? this.stop() : this.start(); },

      sync: function () {
        if (!el.btnVoice) return;
        el.btnVoice.setAttribute('aria-pressed', String(this.active));
        el.btnVoice.setAttribute('aria-label', this.active ? 'إيقاف المتابعة الصوتية' : 'المتابعة الصوتية');
      },

      /* Tap a word while following to tell the app where the khateeb is. */
      anchorAt: function (x, y) {
        var node = null, offset = 0;
        if (document.caretPositionFromPoint) {
          var cp = document.caretPositionFromPoint(x, y);
          if (cp) { node = cp.offsetNode; offset = cp.offset; }
        } else if (document.caretRangeFromPoint) {
          var cr = document.caretRangeFromPoint(x, y);
          if (cr) { node = cr.startContainer; offset = cr.startOffset; }
        }
        if (!node) return false;
        this.ensureIndex();
        for (var i = 0; i < this.words.length; i++) {
          var w = this.words[i];
          if (w.node === node && offset >= w.start && offset <= w.end) {
            this.pos = i;
            this.locked = true;
            this.paint(false);
            return true;
          }
        }
        return false;
      }
    };

    function bindControls() {
      el.btnLarger.addEventListener('click', function () { TypeScale.nudge(1); });
      el.btnSmaller.addEventListener('click', function () { TypeScale.nudge(-1); });
      el.btnAuto.addEventListener('click', function () { AutoScroll.toggle(); });
      if (el.btnVoice) el.btnVoice.addEventListener('click', function () { Voice.toggle(); });
      window.addEventListener('resize', function () {
        if (Voice.active && Voice.layer) Voice.paint(false);
      });
      el.btnDark.addEventListener('click', function () { Theme.toggleDark(); });
      el.btnPanel.addEventListener('click', function () { Chrome.togglePanel(); });
      el.btnPanelClose.addEventListener('click', function () { Chrome.closePanel(true); });
      el.scrim.addEventListener('click', function () { Chrome.closePanel(false); });

      if (el.btnNavChapter) {
        el.btnNavChapter.addEventListener('click', function () {
          AutoScroll.park();
          Metrics.refresh();
          var inSecond = (window.scrollY + Metrics.winHeight * 0.35) >= Metrics.p2Top;
          var targetTop = inSecond ? Metrics.p0Top : Metrics.p2Top;
          var top = clamp(targetTop - 78, 0, Metrics.maxScroll);
          window.scrollTo({ top: top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
          Announce.say(inSecond ? 'الانتقال إلى الخطبة الأولى' : 'الانتقال إلى الخطبة الثانية', true);
        });
      }

      if (el.btnCopy) {
        el.btnCopy.addEventListener('click', function () {
          var cleanText = (el.sheet.innerText || el.sheet.textContent || '').replace(TATWEEL_RE, '').trim();
          copyTextToClipboard(cleanText, 'تم نسخ نص الخطبة بالكامل');
        });
      }

      el.panel.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var items = Array.prototype.filter.call(
          el.panel.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'),
          function (node) { return node.getClientRects().length > 0; }
        );
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      });

      // Dock ---------------------------------------------------------------
      el.dockToggle.addEventListener('click', function () { AutoScroll.toggle(); });
      el.dockSlower.addEventListener('click', function () {
        AutoScroll.setSpeed(stepPreset(Prefs.data.speed, -1), true);
      });
      el.dockFaster.addEventListener('click', function () {
        AutoScroll.setSpeed(stepPreset(Prefs.data.speed, 1), true);
      });

      // Panel --------------------------------------------------------------
      el.themeGroup.addEventListener('click', function (event) {
        var button = event.target.closest('[data-theme]');
        if (button) Theme.apply(button.dataset.theme, true);
      });

      if (el.glassGroup) {
        el.glassGroup.addEventListener('click', function (event) {
          var button = event.target.closest('[data-glass-variant]');
          if (button) LiquidGlass.applyVariant(button.getAttribute('data-glass-variant'), true);
        });
      }

      el.leadGroup.addEventListener('click', function (event) {
        var button = event.target.closest('[data-lh]');
        if (button) TypeScale.applyLead(button.dataset.lh, true);
      });

      el.sizeUp.addEventListener('click', function () { TypeScale.nudge(1); });
      el.sizeDown.addEventListener('click', function () { TypeScale.nudge(-1); });

      var sliderRaf = 0;
      el.sizeSlider.addEventListener('input', function () {
        var val = Number(this.value);
        TypeScale.updateSliderFill(val);
        el.sizeValue.textContent = val + '%';
        if (sliderRaf) cancelAnimationFrame(sliderRaf);
        sliderRaf = requestAnimationFrame(function () {
          TypeScale.applySize(val / 100, false, true, true);
        });
      });
      el.sizeSlider.addEventListener('change', function () {
        Kashida.schedule(60);
        Announce.say('حجم الخط ' + this.value + '٪', false);
      });

      el.accentColor.addEventListener('input', function () { applyAccent(this.value, true); });
      if (el.accentSwatches) {
        el.accentSwatches.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-color]');
          if (btn) applyAccent(btn.dataset.color, true);
        });
      }

      el.widthGroup.addEventListener('click', function (event) {
        var button = event.target.closest('[data-width]');
        if (button) TypeScale.applyWidth(button.dataset.width, true);
      });

      el.kashidaGroup.addEventListener('click', function (event) {
        var button = event.target.closest('[data-kashida]');
        if (button) Kashida.setLevel(button.dataset.kashida, true);
      });

      // Fullscreen ---------------------------------------------------------
      el.btnFull.addEventListener('click', function () { Fullscreen.toggle(); });
      el.fullToggle.addEventListener('change', function () {
        this.checked ? Fullscreen.enter() : Fullscreen.exit();
      });
      ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (type) {
        document.addEventListener(type, function () {
          Metrics.refresh();
          Fullscreen.reflect();
        });
      });

      el.lowDataToggle.addEventListener('change', function () {
        LowData.apply(this.checked, true);
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden && AutoScroll.running) AutoScroll.park();
        /* The screen lock is dropped when the page is hidden; take it again. */
        if (!document.hidden && Voice.active) {
          Voice.keepAwake();
          if (!Voice.rec) Voice.listen();
        }
      });

      el.speedGroup.addEventListener('click', function (event) {
        var chip = event.target.closest('.speedChip');
        if (chip) AutoScroll.setSpeed(chip.dataset.speed, true);
      });

      el.autoToggle.addEventListener('change', function () {
        this.checked ? AutoScroll.start(true) : AutoScroll.stop(true);
      });

      el.btnTop.addEventListener('click', function () {
        AutoScroll.park();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      });

      el.btnShare.addEventListener('click', function () {
        var shareUrl = (location.protocol === 'http:' || location.protocol === 'https:')
          ? location.href
          : '';
        if (shareUrl && navigator.share) {
          navigator.share({ title: document.title, url: shareUrl })['catch'](function (error) {
            if (error && error.name !== 'AbortError') {
              copyTextToClipboard(shareUrl, 'تم نسخ رابط الخطبة');
            }
          });
        } else if (shareUrl) {
          copyTextToClipboard(shareUrl, 'تم نسخ رابط الخطبة إلى الحافظة');
        } else {
          var cleanText = (el.sheet.innerText || el.sheet.textContent || '').replace(TATWEEL_RE, '').trim();
          copyTextToClipboard(document.title + '\n\n' + cleanText, 'تم نسخ نص الخطبة للمشاركة');
        }
      });

      el.btnReset.addEventListener('click', function () {
        ResetDialog.open();
      });
      el.btnResetCancel.addEventListener('click', function () {
        ResetDialog.close();
      });
      el.btnResetConfirm.addEventListener('click', function () {
        ResetDialog.confirm();
      });
      el.resetAlert.addEventListener('click', function (event) {
        if (event.target === el.resetAlert) ResetDialog.close();
      });

      if (el.chapterSwitch) {
        el.chapterSwitch.addEventListener('click', function (event) {
          var link = event.target.closest('a[href^="#"]');
          if (!link) return;
          var target = document.getElementById(link.getAttribute('href').slice(1));
          if (!target) return;
          event.preventDefault();
          AutoScroll.park();
          Metrics.refresh();
          var top = clamp(offsetTop(target) - 78, 0, Metrics.maxScroll);
          window.scrollTo({ top: top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        });
      }

      // Interactive swipe-down to dismiss the inset Liquid Glass sheet
      (function () {
        var startY = 0, currentY = 0, dragging = false;
        function onTouchStart(e) {
          if (!Chrome.panelOpen || window.innerWidth >= 760) return;
          if (el.panelBody.scrollTop > 0 && !e.target.closest('.panel__head, .panel__grab')) return;
          startY = e.touches[0].clientY;
          currentY = startY;
          dragging = true;
          el.panel.style.transition = 'none';
        }
        function onTouchMove(e) {
          if (!dragging) return;
          currentY = e.touches[0].clientY;
          var dy = Math.max(0, currentY - startY);
          if (dy > 0) {
            el.panel.style.transform = 'translate3d(0, ' + dy + 'px, 0)';
          }
        }
        function onTouchEnd() {
          if (!dragging) return;
          dragging = false;
          el.panel.style.transition = '';
          el.panel.style.transform = '';
          if (currentY - startY > 90) {
            Chrome.closePanel(false);
          }
        }
        el.panel.addEventListener('touchstart', onTouchStart, { passive: true });
        el.panel.addEventListener('touchmove', onTouchMove, { passive: true });
        el.panel.addEventListener('touchend', onTouchEnd, { passive: true });
      })();

      el.reader.addEventListener('click', function (event) {
        if (event.target.closest('button, a, input, .panel')) return;
        var selection = window.getSelection();
        if (selection && String(selection).length > 0) return;

        /* One tap on the khutbah text pauses auto-scroll; the next tap resumes it.
           When auto-scroll is off (and was not paused by a tap), a tap keeps
           its usual job of showing / hiding the bars. */
        if (event.target.closest('#sheet')) {
          if (Voice.active) {
            /* While following the voice, a tap on a word moves the highlight there. */
            Voice.anchorAt(event.clientX, event.clientY);
            Chrome.show();
            return;
          }
          if (AutoScroll.running) {
            AutoScroll.stop(true, 'إيقاف مؤقت — المس النص للاستئناف');
            AutoScroll.tapPaused = true;
            /* stop() settles the page with one scroll, which the scroll handler
               reads as "scrolling down" and hides the bars; show them after it. */
            requestAnimationFrame(function () {
              requestAnimationFrame(function () { Chrome.show(); });
            });
            return;
          }
          if (AutoScroll.tapPaused) {
            AutoScroll.start(false);
            Announce.say('استئناف التمرير التلقائي', true);
            return;
          }
        }
        Chrome.toggle();
      });

      /* Manual selections should paste clean text: strip the tatweel that the
         Kashida engine inserted for justification. */
      document.addEventListener('copy', function (event) {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !event.clipboardData) return;
        if (!el.sheet.contains(sel.anchorNode) && !el.sheet.contains(sel.focusNode)) return;
        event.clipboardData.setData('text/plain', String(sel).replace(TATWEEL_RE, ''));
        event.preventDefault();
      });

      bindRadioGroups();
      bindCompactTitle();
      updateReadingTime();

      document.addEventListener('keydown', Keys.handle);
      LiquidGlass.bindInteractiveSurfaces();
    }

    /* WAI-ARIA radio group pattern: one tab stop per group, arrow keys move
       and select (RTL-aware: → goes to the previous item in Arabic). */
    function syncRovingTabindex(group) {
      var radios = group.querySelectorAll('[role="radio"]');
      var checked = group.querySelector('[role="radio"][aria-checked="true"]') || radios[0];
      for (var i = 0; i < radios.length; i++) radios[i].tabIndex = radios[i] === checked ? 0 : -1;
    }

    function bindRadioGroups() {
      var groups = document.querySelectorAll('[role="radiogroup"]');
      Array.prototype.forEach.call(groups, function (group) {
        syncRovingTabindex(group);
        new MutationObserver(function () { syncRovingTabindex(group); })
          .observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });

        group.addEventListener('keydown', function (event) {
          var keys = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1, Home: 0, End: 0 };
          if (!(event.key in keys) || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
          var radios = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
          var i = radios.indexOf(document.activeElement);
          if (i === -1) return;
          var rtl = getComputedStyle(group).direction === 'rtl';
          var step = keys[event.key];
          if (!rtl && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) step = -step;
          var next = event.key === 'Home' ? 0
            : event.key === 'End' ? radios.length - 1
            : (i + step + radios.length) % radios.length;
          event.preventDefault();
          event.stopPropagation();
          radios[next].focus();
          radios[next].click();
        });
      });
    }

    /* iOS large-title behaviour: the compact title in the bar appears only once
       the big heading has scrolled out of view, instead of duplicating it. */
    function bindCompactTitle() {
      var heading = document.getElementById('introTitle');
      if (!heading || !('IntersectionObserver' in window)) {
        el.body.classList.add('has-compact-title');
        return;
      }
      new IntersectionObserver(function (entries) {
        var visible = entries[0].isIntersecting;
        el.body.classList.toggle('has-compact-title', !visible);
      }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 }).observe(heading);
    }

    function updateReadingTime() {
      if (!el.readingMeta) return;
      var words = (el.sheet.textContent || '').replace(TATWEEL_RE, '').trim().split(/\s+/).length;
      var minutes = Math.max(1, Math.round(words / 160)); /* unhurried silent reading, Arabic */
      var n = minutes.toLocaleString('ar-EG');
      el.readingMeta.textContent = 'قراءة نحو ' + n + (minutes >= 3 && minutes <= 10 ? ' دقائق' : ' دقيقة');
    }

    function bindScroll() {
      var ticking = false;

      window.addEventListener('scroll', function () {
        if (AutoScroll.running && AutoScroll.isForeign()) {
          AutoScroll.park();
          Chrome.poke();
        }
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(function () {
            ticking = false;
            if (!AutoScroll.running || AutoScroll.parked) {
              updateReadingProgress(window.scrollY);
              scheduleSave();
            }
            if (!AutoScroll.running) autoHideByDirection();
          });
        }
      }, { passive: true });

      /* Only reveal the bars on user input while auto-scroll is playing (so the
         dock is reachable). During normal reading, poking here on every wheel /
         touch tick cancelled autoHideByDirection and the bars never hid. */
      window.addEventListener('wheel', function (event) {
        if (!isChromeTarget(event.target) && AutoScroll.running) {
          AutoScroll.commit();
          AutoScroll.park();
          Chrome.poke();
        }
      }, { passive: true });

      var touchStartY = 0, touchStartX = 0, touchInChrome = false;
      window.addEventListener('touchstart', function (event) {
        touchInChrome = isChromeTarget(event.target);
        if (!touchInChrome && AutoScroll.running && !AutoScroll.parked) {
          // Flush GPU translate3d offset into native window.scrollY immediately
          // on finger-down so native touch scrolling in either direction starts
          // from the exact pixel on screen with zero jump.
          AutoScroll.commit();
        }
        if (event.touches && event.touches.length) {
          touchStartY = event.touches[0].clientY;
          touchStartX = event.touches[0].clientX;
        }
      }, { passive: true });

      window.addEventListener('touchmove', function (event) {
        if (touchInChrome || !event.touches || !event.touches.length) return;
        var dy = Math.abs(event.touches[0].clientY - touchStartY);
        var dx = Math.abs(event.touches[0].clientX - touchStartX);
        if ((dy > 5 || dx > 5) && AutoScroll.running) {
          AutoScroll.park();
          Chrome.poke();
        }
      }, { passive: true });

      window.addEventListener('keydown', function (event) {
        if (event.shiftKey) return;
        var navKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
        if (navKeys.indexOf(event.key) !== -1 && AutoScroll.running) {
          AutoScroll.commit();
          AutoScroll.park();
        }
      });

      var resizeTimer = 0;
      var lastWinWidth = window.innerWidth;
      var lastSheetWidth = el.sheet.clientWidth;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          if (AutoScroll.running) AutoScroll.commit();
          var widthChanged = Math.abs(window.innerWidth - lastWinWidth) > 2 ||
                             Math.abs(el.sheet.clientWidth - lastSheetWidth) > 2;
          lastWinWidth = window.innerWidth;
          lastSheetWidth = el.sheet.clientWidth;
          Metrics.refresh();
          AutoScroll.sync();
          if (widthChanged) Kashida.schedule();
          updateReadingProgress(effectiveScrollY());
        }, 160);
      });

      window.addEventListener('pagehide', function () {
        if (AutoScroll.running) AutoScroll.commit();
        Progress.save();
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          if (AutoScroll.running) AutoScroll.commit();
          Progress.save();
        }
      });
    }

    var saveTimer = 0;
    var lastProgressPct = -1;
    var lastProgressRatio = -1;
    var lastInSecond = null;

    function updateReadingProgress(customY) {
      var y = typeof customY === 'number' ? customY : effectiveScrollY();
      var ratio = clamp((y - Metrics.sheetTop) / Metrics.sheetAvailable, 0, 1);
      var percent = Math.round(ratio * 100);

      if (Math.abs(ratio - lastProgressRatio) > 0.0004) {
        lastProgressRatio = ratio;
        el.readingProgressFill.style.transform = 'scale3d(' + ratio.toFixed(4) + ', 1, 1)';
      }
      if (percent !== lastProgressPct) {
        lastProgressPct = percent;
        el.readingProgress.setAttribute('aria-valuenow', String(percent));
      }

      if (Metrics.p2Top > 0 && Metrics.chapterLinks.length === 2) {
        var inSecond = (y + Metrics.winHeight * 0.35) >= Metrics.p2Top;
        if (inSecond !== lastInSecond) {
          lastInSecond = inSecond;
          Metrics.chapterLinks[0].classList.toggle('is-active', !inSecond);
          Metrics.chapterLinks[1].classList.toggle('is-active', inSecond);
          if (inSecond) {
            Metrics.chapterLinks[0].removeAttribute('aria-current');
            Metrics.chapterLinks[1].setAttribute('aria-current', 'location');
          } else {
            Metrics.chapterLinks[1].removeAttribute('aria-current');
            Metrics.chapterLinks[0].setAttribute('aria-current', 'location');
          }
          if (el.navChapterText) {
            el.navChapterText.textContent = inSecond ? 'الخطبة ٢' : 'الخطبة ١';
          }
          if (el.btnNavChapter) {
            /* The pill shows where you are; its label says where it will take you. */
            el.btnNavChapter.setAttribute('aria-label', inSecond
              ? 'أنت في الخطبة الثانية — ارجع إلى الخطبة الأولى'
              : 'أنت في الخطبة الأولى — انتقل إلى الخطبة الثانية');
            el.btnNavChapter.title = inSecond ? 'الرجوع إلى الخطبة الأولى' : 'الانتقال إلى الخطبة الثانية';
          }
        }
      }
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { Progress.save(); }, 400);
    }

    var lastY = 0, downRun = 0;
    function autoHideByDirection() {
      var y = window.scrollY;
      var delta = y - lastY;
      lastY = y;
      if (delta > 0) {
        downRun += delta;
        if (downRun > 65) Chrome.hide();
      } else if (delta < -14) {
        downRun = 0;
        Chrome.show();
      }
    }

    function applyStoredPrefs() {
      Theme.apply(Prefs.data.theme, false);
      LiquidGlass.applyVariant(Prefs.data.glassVariant, false);
      LowData.apply(
        typeof Prefs.data.lowData === 'boolean' ? Prefs.data.lowData : LowData.detect(),
        false
      );
      TypeScale.applySize(Prefs.data.fontScale, false, false, true);
      TypeScale.applyLead(Prefs.data.lineHeight, false, false);
      TypeScale.applyWidth(Prefs.data.measure, false, false);
      Kashida.level = Prefs.data.kashida;
      Kashida.setLevel(Prefs.data.kashida, false);
      AutoScroll.setSpeed(Prefs.data.speed, false);
      AutoScroll.reflect();

      if (!Fullscreen.supported()) {
        el.btnFull.hidden = true;
        el.fullToggle.closest('.switch').hidden = true;
      } else {
        el.fullToggle.checked = Fullscreen.active();
      }
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    Prefs.load();
    Anchor.collect();
    Metrics.refresh();
    applyStoredPrefs();

    var systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
    var syncSystemTheme = function () {
      if (Prefs.data.theme === 'system') Theme.apply('system', false);
    };
    if (systemScheme.addEventListener) systemScheme.addEventListener('change', syncSystemTheme);
    else if (systemScheme.addListener) systemScheme.addListener(syncSystemTheme);

    bindControls();
    bindScroll();

    var ready = document.fonts && document.fonts.ready
      ? document.fonts.ready
      : Promise.resolve();

    ready.then(function () {
      Kashida.schedule(0);
      Metrics.refresh();
      Progress.restore();
      updateReadingProgress(window.scrollY);
      lastY = window.scrollY;

      if (Prefs.data.autoScroll) {
        setTimeout(function () { AutoScroll.start(false); }, 900);
      }
      if (!Store.available) {
        Announce.say('التخزين المحلي غير متاح، لن تُحفظ التفضيلات', false);
      }
    });

    /* Offline support: save the khutbah on the device (needs http(s), not file://). */
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      var firstInstall = !navigator.serviceWorker.controller;
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          var sw = reg.installing || reg.waiting;
          if (!firstInstall || !sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'activated') {
              Announce.say('الخطبة محفوظة — يمكنك قراءتها دون إنترنت', true);
            }
          });
        }).catch(function () { /* offline support unavailable */ });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
})();