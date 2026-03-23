"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// polish.js — Müzik equalizer, sekme soluklaşma, tooltip zekası,
//             context menu animasyonu, renk sıcaklığı, noise texture,
//             animasyon hız ayarı, permission pulse
// ═══════════════════════════════════════════════════════════════════════════

// ── 1. ANİMASYON HIZ SİSTEMİ ────────────────────────────────────────────────
// Ayarlar'dan kontrol edilir: "slow" | "normal" | "fast" | "off"

const ANIM_SPEEDS = {
  off:    { fast: "0ms",   mid: "0ms",   slow: "0ms"   },
  fast:   { fast: "60ms",  mid: "100ms", slow: "180ms"  },
  normal: { fast: "120ms", mid: "200ms", slow: "320ms"  },
  slow:   { fast: "220ms", mid: "380ms", slow: "600ms"  },
};

function applyAnimSpeed(speed) {
  const s = ANIM_SPEEDS[speed] || ANIM_SPEEDS.normal;
  const root = document.documentElement;
  root.style.setProperty("--dur-fast", s.fast);
  root.style.setProperty("--dur-mid",  s.mid);
  root.style.setProperty("--dur-slow", s.slow);
  // Sistem prefers-reduced-motion'ı da say
  if (speed === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.dataset.animOff = "1";
  } else {
    delete root.dataset.animOff;
  }
}

// updateSettings hook'u — ayar değişince çağır
const _origUpdateSettings = typeof updateSettings === "function" ? updateSettings : null;
setTimeout(() => {
  // settings yüklendikten sonra uygula
  const speed = S.settings?.animSpeed || "normal";
  applyAnimSpeed(speed);
}, 400);

// ── 2. RENK SICAKLIĞI (Gece modu) ───────────────────────────────────────────
// Gece saatlerinde (21:00–07:00) UI hafifçe sıcak tona kayar
// Ayarlardan açılıp kapatılabilir

let _warmTimer = null;

function applyColorTemperature() {
  if (!S.settings?.warmNightMode) {
    document.documentElement.style.removeProperty("--warm-filter");
    document.body.style.filter = "";
    return;
  }
  const h = new Date().getHours();
  // 21:00 → 07:00 arası gece modu
  const isNight = h >= 21 || h < 7;
  // Saat 21'den gece yarısına kadar kademeli artış, sabah 5'ten 7'ye kadar azalış
  let intensity = 0;
  if (h >= 21) intensity = Math.min((h - 21) / 2, 1) * 0.06;
  else if (h < 5) intensity = 0.06;
  else if (h < 7) intensity = (1 - (h - 5) / 2) * 0.06;

  if (intensity > 0) {
    // Çok hafif sarı-turuncu tint — brightness normal, sadece sepia
    document.body.style.filter = `sepia(${intensity * 100}%) brightness(${1 - intensity * 0.03})`;
  } else {
    document.body.style.filter = "";
  }
}

function startColorTemperatureLoop() {
  applyColorTemperature();
  clearInterval(_warmTimer);
  _warmTimer = setInterval(applyColorTemperature, 60 * 1000); // Her dakika kontrol
}

// ── 3. NOISE TEXTURE (Grain overlay) ────────────────────────────────────────
// Canvas ile üretilmiş grain texture — CSS::before'dan daha performanslı

function ensureNoiseTexture() {
  if (document.getElementById("_noise_canvas")) return;
  const size = 180;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  // Statik gürültü üret
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255 | 0;
    data[i] = data[i+1] = data[i+2] = v;
    data[i+3] = 18; // Çok düşük alpha
  }
  ctx.putImageData(img, 0, 0);

  // CSS'e pattern olarak ekle
  const dataUrl = canvas.toDataURL();
  let el = document.getElementById("_noise_style");
  if (!el) { el = document.createElement("style"); el.id = "_noise_style"; document.head.appendChild(el); }
  el.textContent = `
    body[data-grain]::before {
      background-image: url("${dataUrl}") !important;
      background-repeat: repeat !important;
      background-size: ${size}px ${size}px !important;
    }
  `;
}

// ── 4. MÜZİK EQUALIZER (Ses çalan sekme) ────────────────────────────────────
// Ses çalan sekmenin favicon'u yerine animasyonlu 3 çubuk equalizer

let _eqStyle = null;

function injectEqualizerStyle() {
  if (_eqStyle) return;
  _eqStyle = document.createElement("style");
  _eqStyle.id = "_eq_style";
  _eqStyle.textContent = `
    @keyframes eq1 { 0%,100%{height:3px} 25%{height:10px} 50%{height:6px} 75%{height:12px} }
    @keyframes eq2 { 0%,100%{height:8px} 25%{height:3px} 50%{height:12px} 75%{height:5px} }
    @keyframes eq3 { 0%,100%{height:12px} 25%{height:6px} 50%{height:3px} 75%{height:9px} }
    .tab-eq-wrap {
      display: flex; align-items: flex-end; gap: 1.5px;
      width: 14px; height: 14px; flex-shrink: 0;
    }
    .tab-eq-bar {
      width: 3px; border-radius: 1.5px;
      background: var(--accent); opacity: .85;
      transform-origin: bottom;
    }
    .tab-eq-bar:nth-child(1) { animation: eq1 .9s ease-in-out infinite; }
    .tab-eq-bar:nth-child(2) { animation: eq2 .9s ease-in-out infinite .15s; }
    .tab-eq-bar:nth-child(3) { animation: eq3 .9s ease-in-out infinite .3s; }
    .tab-card.is-muted .tab-eq-wrap .tab-eq-bar { animation-play-state: paused; opacity: .35; }
  `;
  document.head.appendChild(_eqStyle);
}

function makeEqualizerEl() {
  const wrap = document.createElement("div"); wrap.className = "tab-eq-wrap";
  for (let i = 0; i < 3; i++) {
    const bar = document.createElement("div"); bar.className = "tab-eq-bar";
    bar.style.height = (4 + i * 3) + "px";
    wrap.appendChild(bar);
  }
  return wrap;
}

// renderTabs'ı patch et — audible sekmede EQ göster
function patchRenderTabsForEQ() {
  if (typeof renderTabs !== "function") { setTimeout(patchRenderTabsForEQ, 300); return; }
  injectEqualizerStyle();

  const _origRT = renderTabs;
  window.renderTabs = function() {
    _origRT();
    // Render bittikten sonra EQ ekle
    requestAnimationFrame(() => {
      document.querySelectorAll(".tab-card").forEach(card => {
        const tabId = card.dataset.tabId;
        const tab = S.tabs?.find(t => t.id === tabId);
        if (!tab) return;

        const fav = card.querySelector(".tab-favicon");
        if (!fav) return;

        // Önceki EQ varsa kaldır
        fav.querySelector(".tab-eq-wrap")?.remove();

        if (tab.audible && !tab.sleeping) {
          // Favicon'un içindeki img veya svg'yi gizle
          const existing = fav.querySelector("img, svg, span");
          if (existing) existing.style.display = "none";
          fav.appendChild(makeEqualizerEl());
        } else {
          // Gizleneni geri göster
          const hidden = fav.querySelector("img, svg, span");
          if (hidden) hidden.style.display = "";
        }
      });
    });
  };
}

// ── 5. SEKME SOLUKLAŞMASI ────────────────────────────────────────────────────
// 20+ dakika açık ve aktif olmayan sekmeler hafifçe solar

let _fadeTimer = null;
const TAB_FADE_MINUTES = 25;

function updateTabFade() {
  const now = Date.now();
  document.querySelectorAll(".tab-card").forEach(card => {
    const tabId = card.dataset.tabId;
    const tab = S.tabs?.find(t => t.id === tabId);
    if (!tab) return;

    // Aktif sekme asla solar
    if (tab.id === S.activeTabId) { card.style.opacity = ""; return; }

    const lastActive = tab._lastActiveAt || tab._createdAt || now;
    const minutesIdle = (now - lastActive) / 60000;

    if (minutesIdle > TAB_FADE_MINUTES) {
      // Max %20 soluklaşma — fark edilir ama rahatsız etmez
      const fade = Math.min(0.2, (minutesIdle - TAB_FADE_MINUTES) / 30 * 0.2);
      card.style.opacity = String(1 - fade);
    } else {
      card.style.opacity = "";
    }
  });
}

function startTabFadeLoop() {
  clearInterval(_fadeTimer);
  _fadeTimer = setInterval(updateTabFade, 2 * 60 * 1000); // 2 dakikada bir
}

// activateTab'ı patch ederek son aktif zamanı kaydet
function patchActivateTabForFade() {
  if (typeof activateTab !== "function") { setTimeout(patchActivateTabForFade, 300); return; }
  const _orig = activateTab;
  window.activateTab = function(tabId) {
    const tab = S.tabs?.find(t => t.id === tabId);
    if (tab) tab._lastActiveAt = Date.now();
    _orig(tabId);
  };
}

// ── 6. AKILLI TOOLTIP ────────────────────────────────────────────────────────
// Kısa hover → mini tooltip, 1.5s+ → genişletilmiş detay

let _ttEl = null, _ttTimer1 = null, _ttTimer2 = null;
const TT_SHORTCUTS = {
  "back-button":    { short: "Geri",    detail: "Önceki sayfaya git\nKısayol: Alt + ←" },
  "forward-button": { short: "İleri",   detail: "Sonraki sayfaya git\nKısayol: Alt + →" },
  "reload-button":  { short: "Yenile",  detail: "Sayfayı yenile\nKısayol: F5 veya Ctrl+R\nSert yenile: Ctrl+Shift+R" },
  "bookmark-button":{ short: "Yer imi", detail: "Bu sayfayı yer imlerine ekle\nKısayol: Ctrl+D" },
  "notes-toggle":   { short: "Notlar",  detail: "Not defterini aç/kapat\nKısayol: Ctrl+N\nNotların otomatik kaydedilir" },
  "focus-btn":      { short: "Odak modu", detail: "Dikkat dağıtıcıları gizle\nSekme şeridini ve yer imlerini gizler\nÇıkmak için: Esc" },
  "incognito-btn":  { short: "Gizli sekme", detail: "Gizli sekme aç\nKısayol: Ctrl+Shift+N\nGeçmiş, çerez ve veri kaydedilmez" },
  "devtools-btn":   { short: "Geliştirici araçları", detail: "Sayfa kaynak kodunu incele\nKısayol: F12\nJS konsolu, ağ izleme ve daha fazlası" },
  "tools-menu-btn": { short: "Araçlar", detail: "Tüm araçlara erişim\nÇeviri, screenshot, yan panel,\nşifre yöneticisi ve daha fazlası" },
  "hist-popup-btn": { short: "Geçmiş",  detail: "Son ziyaretleri gör\nKısayol: Ctrl+H\nTam geçmiş için tıkla" },
  "dl-popup-btn":   { short: "İndirmeler", detail: "İndirmeleri görüntüle\nKısayol: Ctrl+J\nProgres takibi ve dosya açma" },
  "reader-btn":     { short: "Okuma modu", detail: "Sayfayı temiz okuma görünümüne çevir\nReklam ve kenar çubuklarını kaldırır\nFont boyutunu ayarlayabilirsin" },
  "new-tab-button": { short: "Yeni sekme", detail: "Yeni sekme aç\nKısayol: Ctrl+T\nAyarlarda başlangıç sayfasını seç" },
};

function createTooltip(text, detail) {
  destroyTooltip();
  const el = document.createElement("div");
  el.id = "_smart_tt";
  _ttEl = el;
  el.style.cssText = `
    position:fixed;z-index:2147483647;
    background:rgba(16,16,20,.94);
    color:#fff;
    border-radius:9px;
    font-size:12px;
    line-height:1.45;
    pointer-events:none;
    opacity:0;
    max-width:220px;
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    backdrop-filter:blur(8px);
    border:0.5px solid rgba(255,255,255,.1);
    transition:opacity 120ms, transform 120ms cubic-bezier(.34,1.56,.64,1);
    transform:translateY(4px) scale(.96);
    padding:6px 10px;
  `;
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!_ttEl) return;
      el.style.opacity = "1";
      el.style.transform = "translateY(0) scale(1)";
    });
  });
  return el;
}

function expandTooltip(detail) {
  if (!_ttEl) return;
  _ttEl.style.transition = "all 180ms cubic-bezier(.34,1.56,.64,1)";
  _ttEl.innerHTML = detail.split("\n").map((line, i) =>
    i === 0
      ? `<div style="font-weight:600;margin-bottom:4px">${line}</div>`
      : `<div style="opacity:.75;font-size:11px">${line}</div>`
  ).join("");
  // Yeniden konumlandır
  const el = _ttEl;
  setTimeout(() => positionTooltip(el), 10);
}

function positionTooltip(el) {
  if (!el || !_ttAnchor) return;
  const rect = _ttAnchor.getBoundingClientRect();
  const tw = el.offsetWidth || 140;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  el.style.left = left + "px";
  el.style.top  = (rect.bottom + 8) + "px";
}

function destroyTooltip() {
  clearTimeout(_ttTimer1);
  clearTimeout(_ttTimer2);
  if (_ttEl) {
    _ttEl.style.opacity = "0";
    _ttEl.style.transform = "translateY(4px) scale(.96)";
    const el = _ttEl;
    setTimeout(() => el?.remove(), 120);
    _ttEl = null;
  }
}

let _ttAnchor = null;

function initSmartTooltips() {
  // Native title tooltip'leri devre dışı bırak, kendi sistemimizi kullan
  document.addEventListener("mouseover", e => {
    const btn = e.target.closest("[id],[title]");
    if (!btn) return;

    const id = btn.id;
    const info = TT_SHORTCUTS[id];
    if (!info) return;

    // Native tooltip'i geçici kaldır
    if (btn.title) { btn.dataset._ott = btn.title; btn.removeAttribute("title"); }

    _ttAnchor = btn;

    // 300ms sonra mini tooltip
    _ttTimer1 = setTimeout(() => {
      const el = createTooltip(info.short);
      positionTooltip(el);
      // 1.5s sonra genişlet
      _ttTimer2 = setTimeout(() => expandTooltip(info.detail), 1500);
    }, 300);
  });

  document.addEventListener("mouseout", e => {
    const btn = e.target.closest("[id]");
    if (!btn) return;
    // Native title'ı geri koy
    if (btn.dataset._ott) { btn.title = btn.dataset._ott; delete btn.dataset._ott; }
    destroyTooltip();
    _ttAnchor = null;
  });

  // Tıklayınca kapat
  document.addEventListener("mousedown", destroyTooltip);
}

// ── 7. PERMISSION PULSE ──────────────────────────────────────────────────────
// Kamera/mikrofon aktifken güvenlik noktası pulse atar

let _pulseStyle = null;

function injectPulseStyle() {
  if (_pulseStyle) return;
  _pulseStyle = document.createElement("style");
  _pulseStyle.id = "_pulse_style";
  _pulseStyle.textContent = `
    @keyframes permPulse {
      0%,100% { transform:scale(1);   box-shadow:0 0 0 0 var(--accent); }
      50%      { transform:scale(1.3); box-shadow:0 0 0 4px transparent; }
    }
    .security-dot.is-pulsing {
      animation: permPulse 1.4s ease-in-out infinite !important;
    }
  `;
  document.head.appendChild(_pulseStyle);
}

function updatePermissionPulse() {
  const dot = document.querySelector(".security-dot");
  if (!dot) return;
  const active = S.settings?.allowCamera || S.settings?.allowMicrophone;
  dot.classList.toggle("is-pulsing", Boolean(active));
}

// ── 8. CONTEXT MENU GELİŞTİRİLMİŞ ANİMASYON ────────────────────────────────
// Menü öğeleri staggered (sırayla) fade-in ile gelir

function enhanceContextMenus() {
  // MutationObserver ile dinamik context menüleri yakala
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        // _tgm = sekme grup menüsü, .tools-menu-popup vb.
        if (node.id === "_tgm" || node.classList?.contains("tools-menu-popup")) {
          animateMenuItems(node);
        }
      });
    });
  });
  observer.observe(document.body, { childList: true });
}

function animateMenuItems(menu) {
  const items = menu.querySelectorAll("button, a");
  items.forEach((item, i) => {
    item.style.opacity = "0";
    item.style.transform = "translateX(-6px)";
    item.style.transition = `opacity 100ms, transform 120ms cubic-bezier(.34,1.56,.64,1)`;
    requestAnimationFrame(() => {
      setTimeout(() => {
        item.style.opacity = "";
        item.style.transform = "";
      }, i * 30); // Her öğe 30ms gecikmeli
    });
  });
}

// ── AYARLAR ENTEGRASYONU ─────────────────────────────────────────────────────
// settings.html'e animasyon hızı ve gece modu eklemek için internal state hook

function extendInternalStateForPolish() {
  // getInternalState'i genişlet
  if (typeof getInternalState !== "function") { setTimeout(extendInternalStateForPolish, 400); return; }
  const _orig = getInternalState;
  window.getInternalState = function() {
    const state = _orig();
    // Polish ayarlarını meta'ya ekle
    if (state.meta) {
      state.meta.animSpeeds = [
        { id: "fast",   label: "Hızlı"   },
        { id: "normal", label: "Normal"  },
        { id: "slow",   label: "Yavaş"   },
        { id: "off",    label: "Kapalı"  },
      ];
    }
    return state;
  };
}

// updateSettings hook — polish ayarları değişince uygula
function hookUpdateSettings() {
  if (typeof updateSettings !== "function") { setTimeout(hookUpdateSettings, 400); return; }
  const _orig = updateSettings;
  window.updateSettings = function(ns) {
    _orig(ns);
    // Animasyon hızı değiştiyse uygula
    if ("animSpeed" in ns) applyAnimSpeed(ns.animSpeed);
    // Gece modu değiştiyse uygula
    if ("warmNightMode" in ns) applyColorTemperature();
    // İzin ayarları değiştiyse pulse güncelle
    if ("allowCamera" in ns || "allowMicrophone" in ns) updatePermissionPulse();
  };
}

// settings.html'e polish ayarları ekle
function injectPolishSettings() {
  const tryInject = () => {
    const popup = document.getElementById("tools-menu-popup");
    if (!popup) { setTimeout(tryInject, 600); return; }
    if (document.getElementById("tm-anim-speed")) return;

    const sep = document.createElement("div"); sep.className = "tools-menu-sep";
    const sec = document.createElement("div"); sec.className = "tools-menu-section";
    const lbl = document.createElement("div"); lbl.className = "tools-menu-label"; lbl.textContent = "Görsel & Animasyon";

    const SPEEDS = [
      { id: "fast",   label: "Hızlı animasyon" },
      { id: "normal", label: "Normal animasyon" },
      { id: "slow",   label: "Yavaş animasyon"  },
      { id: "off",    label: "Animasyonları kapat" },
    ];

    const speedItems = SPEEDS.map(s => {
      const b = document.createElement("button");
      b.id = "tm-anim-" + s.id;
      b.className = "tools-menu-item";
      b.type = "button";
      const cur = S.settings?.animSpeed || "normal";
      b.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${s.id===cur?"var(--accent)":"transparent"};border:1.5px solid var(--line-mid);flex-shrink:0;margin-right:2px"></span><span style="flex:1">${s.label}</span>`;
      b.addEventListener("click", () => {
        updateSettings({ animSpeed: s.id });
        // Aktif nokta güncelle
        SPEEDS.forEach(x => {
          const el = document.getElementById("tm-anim-" + x.id);
          const dot = el?.querySelector("span");
          if (dot) dot.style.background = x.id === s.id ? "var(--accent)" : "transparent";
        });
        closeToolsMenu();
        showToast("Animasyon: " + s.label);
      });
      return b;
    });

    // Gece modu toggle
    const nightBtn = document.createElement("button");
    nightBtn.id = "tm-night-warm"; nightBtn.className = "tools-menu-item"; nightBtn.type = "button";
    const isNight = Boolean(S.settings?.warmNightMode);
    nightBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0"><path d="M7 1.5a5.5 5.5 0 1 0 5 8A4 4 0 0 1 7 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg><span style="flex:1">Gece renk sıcaklığı</span><span style="font-size:10px;color:${isNight?"var(--accent)":"var(--text-2)"}">${isNight?"Açık":"Kapalı"}</span>`;
    nightBtn.addEventListener("click", () => {
      const cur = !S.settings?.warmNightMode;
      updateSettings({ warmNightMode: cur });
      const span = nightBtn.querySelector("span:last-child");
      if (span) { span.textContent = cur ? "Açık" : "Kapalı"; span.style.color = cur ? "var(--accent)" : "var(--text-2)"; }
      closeToolsMenu();
      showToast(cur ? "Gece renk sıcaklığı açıldı" : "Gece renk sıcaklığı kapatıldı");
    });

    sec.append(lbl, ...speedItems, nightBtn);
    popup.appendChild(sep);
    popup.appendChild(sec);
  };
  setTimeout(tryInject, 500);
}

// ── INIT ─────────────────────────────────────────────────────────────────────
(function initPolish() {
  // DOM hazır olana kadar bekle
  const ready = () => typeof S !== "undefined" && typeof showToast === "function";

  function run() {
    if (!ready()) { setTimeout(run, 200); return; }

    applyAnimSpeed(S.settings?.animSpeed || "normal");
    ensureNoiseTexture();
    startColorTemperatureLoop();
    startTabFadeLoop();
    injectEqualizerStyle();
    injectPulseStyle();
    patchRenderTabsForEQ();
    patchActivateTabForFade();
    initSmartTooltips();
    enhanceContextMenus();
    extendInternalStateForPolish();
    hookUpdateSettings();
    injectPolishSettings();
    updatePermissionPulse();
    setTimeout(initMagneticUI, 200); // tanımdan sonra çağır

    // S.settings değişimini izle (her 2 saniyede bir permission pulse güncelle)
    setInterval(updatePermissionPulse, 2000);
  }

  setTimeout(run, 350);
})();

// ── 9. SEKME KAPATMA ANİMASYONU ─────────────────────────────────────────────
function patchCloseTabForAnimation() {
  if (typeof closeTab !== "function") { setTimeout(patchCloseTabForAnimation, 400); return; }
  const _orig = window.closeTab || closeTab;
  window.closeTab = function(tabId) {
    const card = document.querySelector(`.tab-card[data-tab-id="${tabId}"]`)
      || document.querySelector(`.tab-card[data-tabid="${tabId}"]`)
      || [...document.querySelectorAll(".tab-card")].find(c => c.dataset.tabId === tabId);

    if (card && !card.classList.contains("is-closing")) {
      card.classList.add("is-closing");
      setTimeout(() => _orig(tabId), 150);
    } else {
      _orig(tabId);
    }
  };
}

// ── 10. STAGGERED TAB RESTORE ────────────────────────────────────────────────
function initStaggeredRestore() {
  // DOM'da ilk render'dan sonra sekmelere sıralı animasyon ver
  const obs = new MutationObserver(() => {
    const newCards = document.querySelectorAll(".tab-card:not([data-animated])");
    if (!newCards.length) return;
    newCards.forEach((card, i) => {
      card.dataset.animated = "1";
      // Sadece toplu yükleme sırasında (restore) stagger uygula
      if (i > 0 && i < 12) {
        card.style.animationDelay = (i * 40) + "ms";
        card.classList.add("is-restoring");
        setTimeout(() => {
          card.classList.remove("is-restoring");
          card.style.animationDelay = "";
        }, 220 + i * 40);
      }
    });
  });
  const bar = document.getElementById("tabs-bar");
  if (bar) obs.observe(bar, { childList: true });
}

// ── 11. SCROLL HIZ FEEDBACK ──────────────────────────────────────────────────
(function initScrollFeedback() {
  let _lastScroll = 0, _scrollV = 0, _scrollTimer = null;
  let _fastClass = false;

  document.addEventListener("scroll", e => {
    const now = performance.now();
    const target = e.target;
    if (target === document || target.nodeType !== 1) return;

    const delta = Math.abs(target.scrollTop - _lastScroll);
    _lastScroll = target.scrollTop;
    _scrollV = delta / Math.max(1, now - (_lastScroll || now));

    if (delta > 60 && !_fastClass) {
      _fastClass = true;
      target.classList.add("fast-scroll");
    }
    clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(() => {
      _fastClass = false;
      target.classList.remove("fast-scroll");
    }, 300);
  }, { passive: true, capture: true });

  const s = document.createElement("style");
  s.textContent = `.fast-scroll::-webkit-scrollbar{width:7px!important;height:7px!important}`;
  document.head.appendChild(s);
})();

// ── 11B. MAGNETIC & SPRING PHYSICS (Liquid UI) ──────────────────────────────
function initMagneticUI() {
  // Edge'in bile yapmadigi premium his: Butonlar fareye dogru cekilir
  const MAGNETIC_DISTANCE = 30; // Etki alani
  const MAGNETIC_POWER = 0.4; // Yay degeri
  
  function attachMagnet(btn, type) {
    if(btn.dataset.magnetized) return;
    btn.dataset.magnetized = "1";
    
    let isHovering = false;
    
    btn.addEventListener("mousemove", (e) => {
      isHovering = true;
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;
      
      // Sedece sinirlar icindeyken veya cok yakinken etki etsin diye distance hesabi eklenebilir
      // Fakat mousemove oldugu icin sadece uzerindeyken calisir
      let power = type === "heavy" ? 0.15 : type === "light" ? 0.3 : 0.25;
      
      const x = distanceX * power;
      const y = distanceY * power;
      
      btn.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
      btn.style.transition = 'transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)';
    }, {passive:true});
    
    btn.addEventListener("mouseleave", () => {
      isHovering = false;
      btn.style.transform = "translate(0, 0) scale(1)";
      // Bounce geri donus animasyonu
      btn.style.transition = "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)"; 
    });
  }

  // Yeni eklenen butonlari izlemek
  const observer = new MutationObserver(mutations => {
    // Sadece baslangicta bir kere bulmak yerine dinamik DOM guncellemelerine reaksiyon verilir
  });
  
  // Baslangic butonlari
  setTimeout(() => {
    document.querySelectorAll(".control-button, .tab-add-button, .site-info-btn, .brand-button").forEach(b => attachMagnet(b, "normal"));
    document.querySelectorAll(".tools-menu-item").forEach(b => attachMagnet(b, "light"));
  }, 1000);
}

// ── 12. ICON MORPHING (Reload → Stop) ───────────────────────────────────────
// setReloadState fonksiyonunu patch et
function patchReloadIconMorph() {
  const btn = document.getElementById("reload-button");
  if (!btn) { setTimeout(patchReloadIconMorph, 500); return; }

  // SVG path tabanlı morph — iki state arasında smooth geçiş
  const RELOAD_PATH = "M12 7A5 5 0 0 1 3 11.2 M2 7A5 5 0 0 1 11 2.8 M11 1v3h-3 M3 13v-3h3";
  const STOP_PATH   = "M2 2l9 9 M11 2L2 11";

  function morphIcon(toStop) {
    const svg = btn.querySelector("svg");
    if (!svg) return;

    // Fade out → swap → fade in
    svg.style.transition = "opacity 80ms, transform 100ms";
    svg.style.opacity = "0";
    svg.style.transform = "scale(.7) rotate(" + (toStop ? "45deg" : "-45deg") + ")";

    setTimeout(() => {
      // Yeni SVG içeriği
      if (toStop) {
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" style="pointer-events:none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      } else {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="pointer-events:none"><path d="M12 7A5 5 0 0 1 3 11.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2 7A5 5 0 0 1 11 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11 1v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13v-3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      const newSvg = btn.querySelector("svg");
      if (newSvg) {
        newSvg.style.opacity = "0";
        newSvg.style.transform = "scale(.7) rotate(" + (toStop ? "-45deg" : "45deg") + ")";
        newSvg.style.transition = "opacity 120ms, transform 180ms cubic-bezier(.34,1.56,.64,1)";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          newSvg.style.opacity = "1";
          newSvg.style.transform = "scale(1) rotate(0deg)";
        }));
      }
    }, 80);
  }

  // setReloadState'i izle
  if (typeof setReloadState === "function") {
    const _orig = setReloadState;
    window.setReloadState = function(loading) {
      morphIcon(loading);
      // Orijinalin title güncellemesini koruyalım
      if (btn) btn.title = loading ? "Durdur (Esc)" : "Yenile (F5)";
    };
  }
}

// ── 13. DOWNLOAD HIZ GRAFİĞİ (Sparkline) ────────────────────────────────────
const _dlSpeedHistory = new Map(); // downloadId → [speeds]

function updateDownloadSpeedGraph(downloadId, receivedBytes, totalBytes) {
  if (!_dlSpeedHistory.has(downloadId)) _dlSpeedHistory.set(downloadId, []);
  const hist = _dlSpeedHistory.get(downloadId);
  hist.push(receivedBytes);
  if (hist.length > 10) hist.shift();
}

function renderSpeedGraph(downloadId, container) {
  const hist = _dlSpeedHistory.get(downloadId) || [];
  if (hist.length < 2) return;

  // Hızları hesapla (delta bytes)
  const speeds = [];
  for (let i = 1; i < hist.length; i++) speeds.push(Math.max(0, hist[i] - hist[i-1]));
  const max = Math.max(...speeds, 1);

  const wrap = document.createElement("div");
  wrap.className = "dl-popup-speed-graph";
  speeds.forEach(spd => {
    const bar = document.createElement("div");
    bar.className = "dl-popup-speed-bar";
    bar.style.height = Math.max(2, Math.round((spd / max) * 24)) + "px";
    bar.title = formatBytes(spd) + "/s";
    wrap.appendChild(bar);
  });
  container.appendChild(wrap);
}

function formatBytes(b) {
  if (!b) return "0 B";
  const u = ["B","KB","MB","GB"], i = Math.floor(Math.log(b)/Math.log(1024));
  return (b/Math.pow(1024,i)).toFixed(1) + " " + u[i];
}

// ── 14. FIND-IN-PAGE SMOOTH HIGHLIGHT ───────────────────────────────────────
function enhanceFindInPage() {
  // found-in-page event'ini dinle
  if (typeof S === "undefined") { setTimeout(enhanceFindInPage, 500); return; }

  // renderer.js'deki found-in-page handler'a ek
  const tabsBar = document.getElementById("tabs-bar");
  if (!tabsBar) return;

  // Custom find sonucu highlight — CSS Highlight API varsa kullan
  if (CSS && CSS.highlights) {
    window.CSS.highlights.set("find-result", new Highlight());
  }
}

// ── 15. CONTEXT MENU CURSOR POZİSYONU ───────────────────────────────────────
// Sağ tık menüsü tam cursor'dan scale(0)→(1) açılır
function patchContextMenuOrigin() {
  const obs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.id !== "_tgm") return;
        // transform-origin'i cursor pozisyonuna ayarla
        const x = _lastMouseX - parseFloat(node.style.left || 0);
        const y = 0; // yukarıdan açılıyor
        node.style.transformOrigin = `${Math.max(0, Math.min(x, 200))}px ${y}px`;
      });
    });
  });
  obs.observe(document.body, { childList: true });
}

let _lastMouseX = 0, _lastMouseY = 0;
document.addEventListener("mousemove", e => { _lastMouseX = e.clientX; _lastMouseY = e.clientY; }, { passive: true });

// ── 16. YENİ SEKME BUTONU — INVITE GESTUREdan sonra hint ───────────────────
// İlk kez 3 saniyede hiçbir şey yapılmazsa yeni sekme butonu nazikçe pulse atar
function initNewTabHint() {
  let shown = sessionStorage.getItem("_ill_nthint");
  if (shown) return;
  const btn = document.getElementById("new-tab-button");
  if (!btn) return;

  setTimeout(() => {
    if (S.tabs?.length > 1) return; // Zaten birden fazla sekme varsa hint yok
    btn.style.transition = "transform 400ms cubic-bezier(.34,1.56,.64,1), box-shadow 400ms";
    btn.style.transform = "scale(1.18) rotate(90deg)";
    btn.style.boxShadow = "0 0 0 4px var(--accent-soft)";
    setTimeout(() => {
      btn.style.transform = "";
      btn.style.boxShadow = "";
      sessionStorage.setItem("_ill_nthint", "1");
    }, 700);
  }, 3000);
}

// ── INIT GÜNCELLEME ──────────────────────────────────────────────────────────
setTimeout(() => {
  patchCloseTabForAnimation();
  initStaggeredRestore();
  patchReloadIconMorph();
  patchContextMenuOrigin();
  enhanceFindInPage();
  initNewTabHint();
}, 500);

// ═══════════════════════════════════════════════════════════════════════════
// KALAN ÖZELLİKLER — Hepsini tamamla
// ═══════════════════════════════════════════════════════════════════════════

// ── 17. SOUND DESIGN ────────────────────────────────────────────────────────
// Web Audio API ile çok hafif, şık UI sesleri
// Ayarlardan açılıp kapatılabilir

const SoundDesign = (() => {
  let _ctx = null;
  let _enabled = false;

  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    return _ctx;
  }

  function play(freq, type, duration, gain, detune = 0) {
    if (!_enabled) return;
    try {
      const ac = ctx();
      const osc = ac.createOscillator();
      const gainNode = ac.createGain();
      osc.connect(gainNode);
      gainNode.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (detune) osc.detune.setValueAtTime(detune, ac.currentTime);
      gainNode.gain.setValueAtTime(0, ac.currentTime);
      gainNode.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch(_) {}
  }

  return {
    enable()  { _enabled = true;  },
    disable() { _enabled = false; },
    isOn()    { return _enabled;  },

    // Yeni sekme — hafif "tık" yukarı
    tabOpen()   { play(900,  "sine",     0.06, 0.025); setTimeout(()=>play(1200,"sine",0.05,0.018), 30); },
    // Sekme kapat — hafif "tık" aşağı
    tabClose()  { play(600,  "sine",     0.07, 0.022); setTimeout(()=>play(400, "sine",0.06,0.015), 35); },
    // Sekme geçişi — ince "whip"
    tabSwitch() { play(1100, "sine",     0.04, 0.012, -200); },
    // Click — genel buton
    click()     { play(800,  "triangle", 0.03, 0.015); },
    // Hata — düşük "thud"
    error()     { play(180,  "sawtooth", 0.15, 0.03); setTimeout(()=>play(140,"sawtooth",0.12,0.025), 60); },
    // Başarı — kısa ding
    success()   { play(1400, "sine",     0.08, 0.02); setTimeout(()=>play(1800,"sine",0.07,0.015), 60); },
    // Download tamamlandı
    downloadDone() { play(1200,"sine",0.08,0.02); setTimeout(()=>play(1500,"sine",0.07,0.02), 80); setTimeout(()=>play(1800,"sine",0.06,0.015), 160); },
    // Yer imi eklendi
    bookmark()  { play(1600, "sine",     0.05, 0.018); setTimeout(()=>play(2000,"sine",0.04,0.014), 50); },
  };
})();

function initSoundDesign() {
  // Ses ayarını yükle
  const soundOn = S.settings?.soundEnabled || false;
  if (soundOn) SoundDesign.enable();

  // Toolbar butonlarına ses bağla
  document.querySelectorAll(".control-button, .toolbar-icon, .tab-add-button").forEach(btn => {
    btn.addEventListener("mousedown", () => SoundDesign.click(), { passive: true });
  });

  // Sekme işlemlerine ses bağla — MutationObserver ile
  const bar = document.getElementById("tabs-bar");
  if (bar) {
    let prevCount = bar.children.length;
    new MutationObserver(() => {
      const curr = bar.children.length;
      if (curr > prevCount) SoundDesign.tabOpen();
      else if (curr < prevCount) SoundDesign.tabClose();
      prevCount = curr;
    }).observe(bar, { childList: true });
  }

  // activateTab sesini bağla
  setTimeout(() => {
    if (typeof activateTab === "function") {
      const _orig = window.activateTab || activateTab;
      window.activateTab = function(tabId) {
        if (tabId !== S.activeTabId) SoundDesign.tabSwitch();
        _orig(tabId);
      };
    }
  }, 600);

  // Ses toggle'ını araçlar menüsüne ekle
  const tryAdd = () => {
    const popup = document.getElementById("tools-menu-popup");
    if (!popup) { setTimeout(tryAdd, 800); return; }
    if (document.getElementById("tm-sound")) return;

    const sec = popup.querySelector(".tools-menu-section:last-child") || popup;
    const btn = document.createElement("button");
    btn.id = "tm-sound"; btn.className = "tools-menu-item"; btn.type = "button";

    const updateBtn = () => {
      const on = SoundDesign.isOn();
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0"><path d="M3 5H1.5v4H3l3 3V2L3 5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>${on?'<path d="M9 4a4 4 0 0 1 0 6M11 2.5a7 7 0 0 1 0 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>':`<path d="M9.5 4.5l4 4M13.5 4.5l-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`}</svg><span style="flex:1">UI sesleri</span><span style="font-size:10px;color:${on?"var(--accent)":"var(--text-2)"}">${on?"Açık":"Kapalı"}</span>`;
    };
    updateBtn();
    btn.addEventListener("click", () => {
      const now = !SoundDesign.isOn();
      now ? SoundDesign.enable() : SoundDesign.disable();
      updateSettings({ soundEnabled: now });
      updateBtn();
      if (now) SoundDesign.success();
      closeToolsMenu();
    });
    sec.appendChild(btn);
  };
  setTimeout(tryAdd, 700);
}

// ── 18. ANIMATED WELCOME WALLPAPER ──────────────────────────────────────────
// Karşılama ekranı arka planı yavaş hareket eden aurora gradient
// welcome.html'e inject edilir

function injectWelcomeWallpaper() {
  // welcome.html içinden kontrol — bu script orada çalışmıyor
  // Bunun yerine webview'a CSS inject ediyoruz
  if (typeof S === "undefined") return;

  const injectToWelcome = () => {
    const welcomeTab = S.tabs?.find(t => t.type === "internal" && t.page === "welcome");
    if (!welcomeTab?.webview || !welcomeTab.internalReady) return;

    const css = `
      @keyframes auroraMove {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body::before {
        content: "";
        position: fixed; inset: 0; z-index: -1;
        background: linear-gradient(
          135deg,
          rgba(176,106,58,.06) 0%,
          rgba(90,130,200,.05) 25%,
          rgba(120,80,180,.04) 50%,
          rgba(176,106,58,.06) 75%,
          rgba(60,150,120,.04) 100%
        );
        background-size: 400% 400%;
        animation: auroraMove 18s ease infinite;
        pointer-events: none;
      }
    `;

    try {
      welcomeTab.webview.insertCSS(css).catch(() => {});
    } catch(_) {}
  };

  // Her sekme aktivasyonunda welcome için tekrar dene
  setTimeout(() => {
    if (typeof activateTab === "function") {
      const _orig = window.activateTab || activateTab;
      window.activateTab = function(tabId) {
        _orig(tabId);
        setTimeout(injectToWelcome, 200);
      };
    }
    injectToWelcome();
  }, 800);
}

// ── 19. PER-SITE FAVİCON RENK TONU ──────────────────────────────────────────
// Sekmeler sitenin dominant rengine göre çok hafif tint alır

const _siteColors = new Map(); // tabId → dominant color

function extractFaviconColor(imgSrc, callback) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      callback(`rgb(${r},${g},${b})`);
    } catch(_) { callback(null); }
  };
  img.onerror = () => callback(null);
  img.src = imgSrc;
}

function applyTabSiteColor(tabId, color) {
  if (!color) return;
  const card = [...document.querySelectorAll(".tab-card")].find(c => c.dataset.tabId === tabId);
  if (!card) return;
  // Çok hafif tint — sadece aktif sekmede, %4 opaklık
  if (tabId === S.activeTabId) {
    card.style.boxShadow = `0 1px 0 ${color.replace("rgb","rgba").replace(")",", .5)")} inset, 0 2px 8px rgba(0,0,0,.08)`;
  }
}

function patchRenderTabsForSiteColor() {
  if (typeof renderTabs !== "function") { setTimeout(patchRenderTabsForSiteColor, 400); return; }
  const _orig = window.renderTabs || renderTabs;
  window.renderTabs = function() {
    _orig();
    // Favicon renkleri uygula
    requestAnimationFrame(() => {
      S.tabs?.forEach(tab => {
        const cached = _siteColors.get(tab.id);
        if (cached) applyTabSiteColor(tab.id, cached);
        else if (tab.favicon && !tab.sleeping) {
          extractFaviconColor(tab.favicon, color => {
            if (color) {
              _siteColors.set(tab.id, color);
              applyTabSiteColor(tab.id, color);
            }
          });
        }
      });
    });
  };
}

// ── 20. DOWNLOAD DRAG-OUT ────────────────────────────────────────────────────
// İndirilen dosyayı popup'tan masaüstüne sürükle

function initDownloadDragOut() {
  // dl-popup içindeki dosyalara draggable ekle
  const observer = new MutationObserver(() => {
    document.querySelectorAll(".dl-popup-item:not([data-drag])").forEach(item => {
      item.dataset.drag = "1";
      const id = item.querySelector("[data-id]")?.dataset.id
        || item.querySelector(".dl-popup-open")?.dataset.id;
      if (!id) return;

      item.setAttribute("draggable", "true");
      item.style.cursor = "grab";

      item.addEventListener("dragstart", e => {
        e.preventDefault(); // Electron'da native drag farklı
        // Electron shell.drag ile native drag başlat
        B.logWrite?.("debug", "drag-start: " + id);
        // IPC üzerinden drag başlat
        ipcRenderer?.send?.("downloads:drag", id);
      });
    });
  });

  const popup = document.getElementById("dl-popup");
  if (popup) observer.observe(popup, { childList: true, subtree: true });
}

// Main.js'e downloads:drag handler eklemek gerekiyor — preload üzerinden
// Mevcut yapıda shell.drag'ı doğrudan renderer'dan çağıramayız
// Alternatif: dosyayı panoya al, sonra paste ile yapıştır
function initDownloadCopyPath() {
  // dl-popup açıldığında dosyalara Ctrl+C = path kopyalama ekle
  document.addEventListener("keydown", e => {
    if (!e.ctrlKey || e.key.toLowerCase() !== "c") return;
    const popup = document.getElementById("dl-popup");
    if (!popup?.classList.contains("is-open")) return;
    const focused = document.activeElement?.closest(".dl-popup-item");
    if (!focused) return;
    const nameEl = focused.querySelector(".dl-popup-name");
    if (nameEl) {
      navigator.clipboard.writeText(nameEl.textContent || "").catch(() => {});
      showToast("Dosya adı kopyalandı");
    }
  });
}

// ── 21. MAGNETIC BUTTONS ─────────────────────────────────────────────────────
// Cursor yaklaştıkça toolbar butonları hafifçe çekilir
// Performans için throttle ve sadece toolbar bölgesi

function initMagneticButtons() {
  if (!S.settings?.magneticButtons) return; // Ayardan kapalıysa atla
  const RANGE = 48, STRENGTH = 0.22;
  let _rafId = null;
  const targets = [];

  // Toolbar butonlarını topla
  setTimeout(() => {
    document.querySelectorAll(".control-button, .toolbar-icon").forEach(btn => {
      targets.push(btn);
    });
  }, 600);

  document.addEventListener("mousemove", e => {
    if (_rafId) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      targets.forEach(btn => {
        if (!document.contains(btn)) return;
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < RANGE) {
          const factor = (1 - dist / RANGE) * STRENGTH;
          btn.style.transform = `translate(${dx * factor}px, ${dy * factor}px)`;
        } else if (btn.style.transform) {
          btn.style.transform = "";
        }
      });
    });
  }, { passive: true });
}

// ── 22. SEKME SIKIŞMA ANİMASYONU ─────────────────────────────────────────────
// Sekme sayısı arttıkça daralmayı smooth animate et

function initTabShrinkAnimation() {
  const bar = document.getElementById("tabs-bar");
  if (!bar) { setTimeout(initTabShrinkAnimation, 500); return; }

  let prevCount = 0;
  new MutationObserver(() => {
    const cards = bar.querySelectorAll(".tab-card");
    const count = cards.length;
    if (count === prevCount) return;

    // Yeni max-width hesapla
    const available = bar.clientWidth - 60; // + butonu için yer bırak
    const maxW = Math.max(80, Math.min(200, Math.floor(available / Math.max(count, 1))));

    // Smooth transition ile uygula
    cards.forEach(card => {
      card.style.transition = "max-width 200ms cubic-bezier(.4,0,.2,1), min-width 200ms cubic-bezier(.4,0,.2,1)";
      card.style.maxWidth = maxW + "px";
      card.style.minWidth = Math.max(48, maxW * 0.5) + "px";
    });

    prevCount = count;
  }).observe(bar, { childList: true });
}

// ── 23. BACK/FORWARD SLIDE GEÇİŞİ ────────────────────────────────────────────
// Geri/ileri'de webview hafif kayar (iframe içinde CSS transition)

function initBackForwardSlide() {
  if (typeof S === "undefined") { setTimeout(initBackForwardSlide, 400); return; }

  let _isNavigating = false;

  const slideCSS = `
    @keyframes slideInFromRight { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:none; } }
    @keyframes slideInFromLeft  { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:none; } }
    body._ill_slide_right { animation: slideInFromRight 180ms cubic-bezier(.32,.72,0,1) both; }
    body._ill_slide_left  { animation: slideInFromLeft  180ms cubic-bezier(.32,.72,0,1) both; }
  `;

  // Back/forward butonlarına yakalanma
  const back = document.getElementById("back-button");
  const fwd  = document.getElementById("forward-button");

  const triggerSlide = (dir) => {
    const at = typeof getActiveTab === "function" ? getActiveTab() : null;
    if (!at?.webview) return;
    _isNavigating = true;
    try {
      at.webview.insertCSS(slideCSS).catch(() => {});
      at.webview.executeJavaScript(`
        document.body.classList.remove("_ill_slide_right","_ill_slide_left");
        void document.body.offsetHeight;
        document.body.classList.add("_ill_slide_${dir}");
        setTimeout(()=>document.body.classList.remove("_ill_slide_${dir}"), 250);
      `).catch(() => {});
    } catch(_) {}
    setTimeout(() => { _isNavigating = false; }, 300);
  };

  if (back) back.addEventListener("mousedown", () => triggerSlide("left"),  { passive: true });
  if (fwd)  fwd.addEventListener("mousedown",  () => triggerSlide("right"), { passive: true });
}

// ── 24. SKELETON PAGE LOADING ─────────────────────────────────────────────────
// DEVRE DIŞI — tab-loading-overlay ile çakışıyor, bej ekran takılmasına yol açıyordu.
// renderer.js'deki tab-loading-overlay bu görevi zaten yerine getiriyor.
function injectSkeletonLoader() { /* intentionally disabled */ }

// ── INIT GÜNCELLEME ──────────────────────────────────────────────────────────
setTimeout(() => {
  initSoundDesign();
  injectWelcomeWallpaper();
  patchRenderTabsForSiteColor();
  initDownloadDragOut();
  initDownloadCopyPath();
  initMagneticButtons();
  initTabShrinkAnimation();
  initBackForwardSlide();
  injectSkeletonLoader();
}, 600);
