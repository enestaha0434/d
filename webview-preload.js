"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// webview-preload.js — Dahili sayfalar için (welcome, settings, history, vb.)
// sandbox: false kalır çünkü webview preload'u Electron'da require() gerektirir.
// AMA: ana pencere preload'u (preload.js) artık sandbox: true ile çalışır.
// Bu dosya sadece webview içindeki iç sayfalara inject edilir.
// ══════════════════════════════════════════════════════════════════════════════
const { contextBridge, ipcRenderer } = require("electron");

// ── Fingerprint koruması — main process'ten config alınır ────────────────────
// Config window.__illuminaPrivacy üzerinden gelir (main.js inject eder)
(function installFingerprintProtection() {
  const cfg = window.__illuminaPrivacy || {};

  if (cfg.blockCanvas) {
    const _toDataURL    = HTMLCanvasElement.prototype.toDataURL;
    const _toBlob       = HTMLCanvasElement.prototype.toBlob;
    const _getImageData = CanvasRenderingContext2D.prototype.getImageData;

    function noiseImageData(imageData) {
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 2;
        d[i]   = Math.max(0, Math.min(255, d[i]   + n));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
      }
      return imageData;
    }

    HTMLCanvasElement.prototype.toDataURL = function(...a) {
      const ctx = this.getContext("2d");
      if (ctx) { try { const id = ctx.getImageData(0,0,this.width,this.height); noiseImageData(id); ctx.putImageData(id,0,0); } catch(_){} }
      return _toDataURL.apply(this, a);
    };
    HTMLCanvasElement.prototype.toBlob = function(cb,...a) {
      const ctx = this.getContext("2d");
      if (ctx) { try { const id = ctx.getImageData(0,0,this.width,this.height); noiseImageData(id); ctx.putImageData(id,0,0); } catch(_){} }
      return _toBlob.call(this, cb, ...a);
    };
    CanvasRenderingContext2D.prototype.getImageData = function(...a) {
      return noiseImageData(_getImageData.apply(this, a));
    };

    // WebGL spoof
    const patchGL = (proto) => {
      if (!proto) return;
      const _orig = proto.getParameter;
      proto.getParameter = function(p) {
        if (p === 37445) return "Intel Inc.";
        if (p === 37446) return "Intel Iris OpenGL Engine";
        return _orig.call(this, p);
      };
    };
    patchGL(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== "undefined") patchGL(WebGL2RenderingContext.prototype);

    // AudioContext spoof
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const _ca = AC.prototype.createAnalyser;
        AC.prototype.createAnalyser = function() {
          const a = _ca.apply(this, arguments);
          const _gf = a.getFloatFrequencyData.bind(a);
          a.getFloatFrequencyData = (arr) => { _gf(arr); for (let i=0;i<arr.length;i++) arr[i]+=(Math.random()-.5)*.0001; };
          return a;
        };
      }
    } catch(_) {}

    // Screen normalize
    try {
      Object.defineProperty(screen, "colorDepth", { get:()=>24, configurable:true });
      Object.defineProperty(screen, "pixelDepth",  { get:()=>24, configurable:true });
    } catch(_) {}

    // Font enumeration kısıtla
    if (document.fonts && document.fonts.check) {
      const _chk = document.fonts.check.bind(document.fonts);
      const SAFE = new Set(["Arial","Times New Roman","Courier New","Georgia","Verdana","Helvetica","sans-serif","serif","monospace"]);
      document.fonts.check = function(font, text) {
        const m = font.match(/"([^"]+)"|'([^']+)'/);
        const name = (m && (m[1]||m[2])||"").trim();
        if (name && !SAFE.has(name)) return false;
        return _chk(font, text);
      };
    }
  }

  if (cfg.spoofUserAgent) {
    try {
      Object.defineProperty(navigator, "vendor",             { get:()=>"Google Inc.",  configurable:true });
      Object.defineProperty(navigator, "platform",           { get:()=>"Win32",        configurable:true });
      Object.defineProperty(navigator, "hardwareConcurrency",{ get:()=>4,              configurable:true });
      Object.defineProperty(navigator, "deviceMemory",       { get:()=>8,              configurable:true });
    } catch(_) {}
  }

  if (cfg.blockWebRTC) {
    try {
      window.RTCPeerConnection       = undefined;
      window.webkitRTCPeerConnection = undefined;
      window.RTCDataChannel          = undefined;
    } catch(_) {}
    if (navigator.mediaDevices) {
      try {
        navigator.mediaDevices.getUserMedia     = () => Promise.reject(new DOMException("NotAllowedError"));
        navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
      } catch(_) {}
    }
  }
})();

// ── DNS prefetch on hover ─────────────────────────────────────────────────────
(function installPrefetch() {
  const prefetched = new Set();
  let _hoverTimer = null;

  document.addEventListener("mouseover", e => {
    const a = e.target.closest("a[href]");
    if (!a || !a.href || a.href.startsWith("javascript:")) return;
    try {
      const url = new URL(a.href);
      if (!["https:","http:"].includes(url.protocol)) return;
      const key = url.origin;
      if (prefetched.has(key) || prefetched.size > 200) return;
      clearTimeout(_hoverTimer);
      _hoverTimer = setTimeout(() => {
        prefetched.add(key);
        const l1 = document.createElement("link"); l1.rel = "dns-prefetch";     l1.href = url.origin;
        const l2 = document.createElement("link"); l2.rel = "preconnect";       l2.href = url.origin;
        document.head.appendChild(l1);
        document.head.appendChild(l2);
      }, 80);
    } catch(_) {}
  }, { passive: true });
})();

// ── İç sayfa iletişim köprüsü ─────────────────────────────────────────────────
const subscribers = new Set();

contextBridge.exposeInMainWorld("browserPage", {
  send(type, payload = {}) {
    ipcRenderer.sendToHost("page-action", { type, payload });
  },
  onState(callback) {
    if (typeof callback !== "function") return () => {};
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  // Weather
  async fetchWeather(lat, lon) {
    return ipcRenderer.invoke("weather:fetch", { lat, lon });
  },
  async geoip() {
    return ipcRenderer.invoke("weather:geoip");
  },
  // News
  async fetchNewsAll() {
    return ipcRenderer.invoke("news:fetch-all");
  },
  async fetchNews(sourceId) {
    return ipcRenderer.invoke("news:fetch", sourceId);
  },
  async newsSources() {
    return ipcRenderer.invoke("news:sources");
  },
  // Store encryption status (settings page için)
  async storeEncryptionStatus() {
    return ipcRenderer.invoke("store:encryptionStatus");
  },
});

ipcRenderer.on("internal-state", (_event, state) => {
  for (const cb of subscribers) {
    try { cb(state); } catch(_) {}
  }
});

// ── DOM hazır olunca event'leri kur ──────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.sendToHost("page-ready");

  // Orta tık → yeni sekmede aç
  document.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const link = e.target.closest("a[href]");
    if (!link || !link.href || link.href.startsWith("javascript:")) return;
    e.preventDefault(); e.stopPropagation();
    ipcRenderer.sendToHost("page-action", { type: "open-url", payload: { url: link.href, newTab: true } });
  }, true);

  // Ctrl+tık → yeni sekmede aç
  document.addEventListener("click", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const link = e.target.closest("a[href]");
    if (!link || !link.href || link.href.startsWith("javascript:")) return;
    e.preventDefault(); e.stopPropagation();
    ipcRenderer.sendToHost("page-action", { type: "open-url", payload: { url: link.href, newTab: true } });
  }, true);
});
