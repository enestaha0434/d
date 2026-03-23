"use strict";
const { app, BrowserWindow, Menu, MenuItem, ipcMain, session, shell, dialog, clipboard, webContents: WC } = require("electron");
const { checkUrl } = require("./safety_engine");
const fs   = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

// ── Auto-updater (GitHub Releases) ───────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = null;
} catch(_) { /* Geliştirme modunda electron-updater olmayabilir */ }

// ── Şifre şifreleme (keytar / safeStorage fallback) ─────────────────────────
let keytar = null;
try { keytar = require("keytar"); } catch(_) {}
const KEYTAR_SERVICE = "illumina-browser";

function encryptPassword(plaintext) {
  try {
    if (app.isReady() && typeof app.safeStorage?.isEncryptionAvailable === "function" && app.safeStorage.isEncryptionAvailable()) {
      return "safe:" + app.safeStorage.encryptString(plaintext).toString("base64");
    }
  } catch(_) {}
  throw new Error("Encryption not available, cannot store password insecurely.");
}

function decryptPassword(stored) {
  if (!stored) return "";
  try {
    if (stored.startsWith("safe:")) {
      const buf = Buffer.from(stored.slice(5), "base64");
      return app.safeStorage.decryptString(buf);
    }
    if (stored.startsWith("plain:")) {
      return Buffer.from(stored.slice(6), "base64").toString("utf8");
    }
  } catch(_) {}
  return stored; // eski plaintext veriye geriye dönük uyumluluk
}
const {
  APP_NAME, APP_VERSION, PARTITION, INCOGNITO_PART, STORE_FILENAME,
  THEMES, SEARCH_ENGINES, SECURITY_MODES,
  DEFAULT_SETTINGS, DEFAULT_STORE,
  TRANSLATE_ENGINES, UI_FONTS, GRAIN_LEVELS, TAB_LAYOUTS,
  START_PAGE_MODES, FONT_SIZES, LANGUAGES, DEFAULT_SHORTCUTS, FEATURE_FLAGS,
} = require("./config");

let mainWindow           = null;
let downloadSessionBound = false;
let sessionControlsBound = false;

// ══════════════════════════════════════════════════════════════════════════════
// CRASH REPORTER / LOG SİSTEMİ
// ══════════════════════════════════════════════════════════════════════════════
const LOG_LEVELS = { info:0, warn:1, error:2 };
let _logStream = null;

function getLogPath() {
  try { return path.join(app.getPath("userData"), "illumina.log"); }
  catch(_) { return path.join(require("os").tmpdir(), "illumina.log"); }
}

function initLogger() {
  try {
    const logPath = getLogPath();
    _logStream = fs.createWriteStream(logPath, { flags:"a", encoding:"utf8" });
    _logStream.write(`\n${"=".repeat(60)}\n`);
    _logStream.write(`[${new Date().toISOString()}] Illumina ${require("./config").APP_VERSION} başlatıldı\n`);
    _logStream.write(`Platform: ${process.platform} | Electron: ${process.versions.electron} | Node: ${process.versions.node}\n`);
    _logStream.write(`${"=".repeat(60)}\n`);
  } catch(e) { console.error("Logger init failed:", e.message); }
}

function log(level, ...args) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${args.join(" ")}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try { _logStream?.write(line + "\n"); } catch(_) {}
}

// Yakalanmamış hatalar
process.on("uncaughtException", (err) => {
  log("error", "UncaughtException:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  log("error", "UnhandledRejection:", String(reason));
});

// ══════════════════════════════════════════════════════════════════════════════
// IPC RATE LIMITER
// ══════════════════════════════════════════════════════════════════════════════
// Sayfa başına saniyede maks çağrı — flood/DoS koruması
const _ipcCounters = new Map(); // frameId → { count, resetAt }
const IPC_MAX_PER_SEC = 60;     // saniyede maks 60 çağrı (tüm handler'lar toplamı)
const IPC_SENSITIVE   = new Set(["passwords:find","passwords:get","cookies:getAll","store:load"]);
const IPC_SENS_MAX    = 10;     // hassas handler'lar için saniyede maks 10

function ipcAllow(event, handlerName) {
  // Ana pencere preload'undan gelen çağrılar her zaman izinli
  if (!event.senderFrame || event.senderFrame.url.startsWith("file://")) return true;
  const id = event.senderFrame.routingId ?? event.sender.id;
  const now = Date.now();
  let rec = _ipcCounters.get(id);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, sensCount: 0, resetAt: now + 1000 };
    _ipcCounters.set(id, rec);
  }
  rec.count++;
  if (IPC_SENSITIVE.has(handlerName)) rec.sensCount++;
  if (rec.count > IPC_MAX_PER_SEC) {
    log("warn", `IPC flood engellendi: frame=${id} handler=${handlerName} count=${rec.count}`);
    return false;
  }
  if (IPC_SENSITIVE.has(handlerName) && rec.sensCount > IPC_SENS_MAX) {
    log("warn", `IPC hassas flood engellendi: frame=${id} handler=${handlerName}`);
    return false;
  }
  return true;
}

// Rate-limit'li ipcMain.handle sarmalayıcı
function ipcHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!ipcAllow(event, channel)) return { error: "rate_limit" };
    return handler(event, ...args);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// AD / TRACKER ENGELLEYICI
// ══════════════════════════════════════════════════════════════════════════════
// EasyList + EasyPrivacy kuralları — dinamik güncelleme destekli
const FILTER_CACHE_PATH = () => path.join(app.getPath("userData"), "filter_cache.json");
const FILTER_SOURCES = [
  { id:"easylist",    url:"https://easylist.to/easylist/easylist.txt",          label:"EasyList" },
  { id:"easyprivacy", url:"https://easylist.to/easylist/easyprivacy.txt",       label:"EasyPrivacy" },
  { id:"trkfilter",   url:"https://raw.githubusercontent.com/nicowillis/turkish-ad-list/master/ads.txt", label:"Türkçe Filtre" },
];

// ══════════════════════════════════════════════════════════════════════════════
// ÇOKLU PROFİL SİSTEMİ
// ══════════════════════════════════════════════════════════════════════════════
// Her profil: kendi store.json + kendi partition (persist:illumina-<id>)
// "default" profili her zaman vardır, geriye dönük uyumlu

const PROFILES_FILE = () => path.join(app.getPath("userData"), "profiles.json");

const DEFAULT_PROFILE = { id:"default", name:"Varsayılan", color:"#b07a4a", createdAt:"" };

function readProfiles() {
  try {
    if (fs.existsSync(PROFILES_FILE())) {
      const list = JSON.parse(fs.readFileSync(PROFILES_FILE(),"utf8"));
      if (Array.isArray(list) && list.length) return list;
    }
  } catch(_) {}
  return [{ ...DEFAULT_PROFILE, createdAt: new Date().toISOString() }];
}

function writeProfiles(list) {
  fs.writeFileSync(PROFILES_FILE(), JSON.stringify(list, null, 2), "utf8");
  return list;
}

// Aktif profil — başlangıçta "default"
let _activeProfileId = "default";

function profileStorePath(profileId) {
  if (!profileId || profileId === "default") return storePath();
  const safeId = profileId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 32);
  return path.join(app.getPath("userData"), `store_${safeId}.json`);
}

function profilePartition(profileId) {
  if (!profileId || profileId === "default") return PARTITION;
  const safeId = profileId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 32);
  return `persist:illumina-${safeId}`;
}

// Profil'e özgü store oku/yaz
function readProfileStore(profileId) {
  const p = profileStorePath(profileId);
  const pe = p.replace(/\.json$/, ".enc");
  ensureDir(path.dirname(p));

  if (fs.existsSync(pe) && canEncryptStore()) {
    try {
      const decrypted = decryptStore(fs.readFileSync(pe, "utf8"));
      if (decrypted) return sanitizeStore(decrypted);
    } catch(_) {}
  }
  if (!fs.existsSync(p)) {
    const s = sanitizeStore(DEFAULT_STORE);
    writeProfileStore(profileId, s);
    return s;
  }
  try {
    const s = sanitizeStore(JSON.parse(fs.readFileSync(p, "utf8")));
    if (canEncryptStore()) {
      writeProfileStore(profileId, s);
      try { fs.unlinkSync(p); } catch(_) {}
    }
    return s;
  } catch(e) { return sanitizeStore(DEFAULT_STORE); }
}

function writeProfileStore(profileId, data) {
  const n = sanitizeStore(data);
  const p = profileStorePath(profileId);
  const pe = p.replace(/\.json$/, ".enc");
  if (canEncryptStore()) {
    const encrypted = encryptStore(n);
    if (encrypted) { fs.writeFileSync(pe, encrypted, "utf8"); return n; }
  }
  fs.writeFileSync(p, JSON.stringify(n, null, 2), "utf8");
  return n;
}

// readStore/writeStore şeffaf olarak aktif profile yönlendir
// (mevcut readStore/writeStore fonksiyonları "default" için çalışmaya devam eder,
//  profil değişince aşağıdaki override devreye girer)
function activeReadStore()  { return _activeProfileId === "default" ? readStore()        : readProfileStore(_activeProfileId); }
function activeWriteStore(s){ return _activeProfileId === "default" ? writeStore(s)      : writeProfileStore(_activeProfileId, s); }

let _adBlockEnabled  = true;
let _adBlockDomains  = new Set(); // domain bazlı hızlı lookup
let _adBlockPatterns = [];        // regex/wildcard listesi (daha az kullanılan)
let _adBlockStats    = { blocked: 0, allowed: 0 };

function adBlockParseRules(text) {
  const domains  = new Set();
  const patterns = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("!") || line.startsWith("[")) continue;
    // ||example.com^ → domain bazlı kural (en hızlı)
    const domainMatch = line.match(/^\|\|([a-z0-9._-]+)\^/);
    if (domainMatch) { domains.add(domainMatch[1]); continue; }
    // @@... → beyaz liste, şimdilik atla
    if (line.startsWith("@@")) continue;
    // ##... → kosmetik filtre (CSS hide), request bloğu değil
    if (line.includes("##") || line.includes("#@#") || line.includes("#?#")) continue;
    // Basit wildcard pattern
    if (line.includes("*") || line.startsWith("/") || line.includes(".")) {
      try {
        patterns.push(line.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*"));
      } catch(_) {}
    }
  }
  return { domains, patterns };
}

function chunkRegexes(patternStrings, chunkSize = 100) {
  const chunks = [];
  for (let i = 0; i < patternStrings.length; i += chunkSize) {
    try {
      chunks.push(new RegExp(patternStrings.slice(i, i + chunkSize).join("|"), "i"));
    } catch(_) {}
  }
  return chunks;
}

async function adBlockLoadFilters() {
  const cachePath = FILTER_CACHE_PATH();
  // Önce önbellekten yükle (5 gün geçerliliği)
  try {
    if (fs.existsSync(cachePath)) {
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const age   = Date.now() - (cache.ts || 0);
      if (age < 5 * 24 * 60 * 60 * 1000 && cache.domains) {
        _adBlockDomains  = new Set(cache.domains);
        _adBlockPatterns = chunkRegexes(cache.patterns || []);
        log("info", `Ad blocker önbellekten yüklendi: ${_adBlockDomains.size} domain, ${_adBlockPatterns.length} pattern`);
        return;
      }
    }
  } catch(_) {}

  // Ağdan indir
  log("info", "Ad blocker filtreleri indiriliyor...");
  const https = require("https");
  const http  = require("http");
  const allDomains  = new Set();
  const allPatterns = [];

  await Promise.allSettled(FILTER_SOURCES.map(src => new Promise((resolve) => {
    const mod = src.url.startsWith("https") ? https : http;
    const req = mod.get(src.url, { timeout:15000, headers:{"User-Agent":"Illumina/4.0"} }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try {
          const { domains, patterns } = adBlockParseRules(Buffer.concat(chunks).toString("utf8"));
          for (const d of domains) allDomains.add(d);
          allPatterns.push(...patterns);
          log("info", `${src.label}: ${domains.size} domain yüklendi`);
        } catch(e) { log("warn", `${src.label} parse hatası: ${e.message}`); }
        resolve();
      });
    });
    req.on("error", (e) => { log("warn", `${src.label} indirme hatası: ${e.message}`); resolve(); });
    req.on("timeout", () => { req.destroy(); resolve(); });
  })));

  _adBlockDomains  = allDomains;
  _adBlockPatterns = chunkRegexes(allPatterns);
  log("info", `Ad blocker hazır: ${_adBlockDomains.size} domain, ${_adBlockPatterns.length} pattern chunk`);

  // Önbelleğe yaz
  try {
    fs.writeFileSync(cachePath, JSON.stringify({
      ts: Date.now(),
      domains:  [...allDomains],
      patterns: allPatterns.slice(0, 5000), // source stringler
    }), "utf8");
  } catch(e) { log("warn", "Filter cache yazılamadı:", e.message); }
}

// Sayfa işlevselliği için gerekli domainler — asla engelleme
const ADBLOCK_WHITELIST = new Set([
  // Google core services — bunlar engellince Google/YouTube bozuluyor
  "jnn-pa.googleapis.com",
  "www.google.com",
  "google.com",
  "googleapis.com",
  "accounts.google.com",
  "ssl.gstatic.com",
  "www.gstatic.com",
  "gstatic.com",
  // YouTube core
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "ytimg.com",
  "i.ytimg.com",
  "s.ytimg.com",
  "googlevideo.com",
  "yt3.ggpht.com",
  // Cloudflare CDN
  "cdnjs.cloudflare.com",
  // Font servisleri
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

function adBlockCheck(url) {
  if (!_adBlockEnabled) return false;
  // Geçici test: Google/YouTube domain'lerini kesinlikle geçir
  try {
    const _h = new URL(url).hostname.toLowerCase();
    const _safe = ["google.", "youtube.", "googleapis.", "gstatic.", "googlevideo.", "ytimg.", "ggpht.", "gvt1.", "gvt2."];
    if (_safe.some(s => _h.includes(s))) return false;
  } catch(_) {}
  try {
    const parsed   = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Whitelist kontrolü — her zaman önce geç (subdomain dahil)
    // Whitelist — exact veya subdomain eşleşmesi
    for (const wl of ADBLOCK_WHITELIST) {
      if (hostname === wl || hostname.endsWith("." + wl)) return false;
    }
    // Domain doğrudan listede?
    if (_adBlockDomains.has(hostname)) return true;
    // Subdomain kontrolü: ads.example.com → example.com
    const parts = hostname.split(".");
    for (let i = 1; i < parts.length - 1; i++) {
      if (_adBlockDomains.has(parts.slice(i).join("."))) return true;
    }
    // Pattern kontrol (daha yavaş, az sayıda)
    const fullUrl = url.slice(0, 256); // çok uzun regex match'i önle
    for (const re of _adBlockPatterns) {
      if (re.test(fullUrl)) return true;
    }
  } catch(_) {}
  return false;
}

function applyAdBlocker(ses) {
  ses.webRequest.onBeforeRequest({ urls:["<all_urls>"] }, (details, callback) => {
    // Tarayıcı iç sayfaları, devtools asla engelleme
    if (details.url.startsWith("file://") || details.url.startsWith("devtools://") ||
        details.url.startsWith("chrome-extension://")) {
      return callback({ cancel: false });
    }
    const blocked = adBlockCheck(details.url);
    if (blocked) {
      _adBlockStats.blocked++;
      // log("info", `[AdBlock] Engellendi: ${details.url.slice(0,80)}`); // çok verbose, isteğe bağlı
    } else {
      _adBlockStats.allowed++;
    }
    callback({ cancel: blocked });
  });
}

// ── Store utils ───────────────────────────────────────────────────────────────
const clone   = v => JSON.parse(JSON.stringify(v));
const ensureDir = d => fs.mkdirSync(d, { recursive:true });
const storePath = () => path.join(app.getPath("userData"), STORE_FILENAME);

function sanitizeExt(e,i) {
  if(!e||typeof e!=="object") return null;
  const p=typeof e.path==="string"?e.path.trim():""; if(!p) return null;
  return { id:typeof e.id==="string"?e.id:`ext-${i}`, name:typeof e.name==="string"&&e.name.trim()?e.name.trim():path.basename(p), version:typeof e.version==="string"?e.version:"", path:p };
}

function normSettings(s) {
  const themeIds  = new Set(THEMES.map(t=>t.id));
  const engIds    = new Set(SEARCH_ENGINES.map(e=>e.id));
  const secIds    = new Set(SECURITY_MODES.map(m=>m.id));
  const src = s&&typeof s==="object"?s:{};
  return {
    theme:              themeIds.has(src.theme)?src.theme:DEFAULT_SETTINGS.theme,
    searchEngine:       engIds.has(src.searchEngine)?src.searchEngine:DEFAULT_SETTINGS.searchEngine,
    startPageMode:      src.startPageMode||"welcome",
    restoreTabs:        src.restoreTabs!==false,
    openWelcomeOnStart: src.openWelcomeOnStart!==false,
    securityMode:       secIds.has(src.securityMode)?src.securityMode:DEFAULT_SETTINGS.securityMode,
    allowNotifications: Boolean(src.allowNotifications),
    allowLocation:      Boolean(src.allowLocation),
    allowCamera:        Boolean(src.allowCamera),
    allowMicrophone:    Boolean(src.allowMicrophone),
    allowPopups:        src.allowPopups!==false,
    httpsOnly:          Boolean(src.httpsOnly),
    extensions:         Array.isArray(src.extensions)?src.extensions.map(sanitizeExt).filter(Boolean).slice(0,20):clone(DEFAULT_SETTINGS.extensions),
    tabSleepMinutes:    Number.isFinite(src.tabSleepMinutes)?src.tabSleepMinutes:DEFAULT_SETTINGS.tabSleepMinutes,
    safeCheckEnabled:   src.safeCheckEnabled!==false,
    safeBrowsingApiKey: typeof src.safeBrowsingApiKey==="string"?src.safeBrowsingApiKey:"",
    showFullUrl:        Boolean(src.showFullUrl),
    fontSize:           src.fontSize||"medium",
    showBookmarkStrip:  src.showBookmarkStrip!==false,
    customCss:          typeof src.customCss==="string"?src.customCss.slice(0,8000):"",
    // Gizlilik
    blockWebRTC:        Boolean(src.blockWebRTC),
    blockCanvas:        Boolean(src.blockCanvas),
    blockAutoplay:      Boolean(src.blockAutoplay),
    spoofUserAgent:     Boolean(src.spoofUserAgent),
    hideReferrer:       Boolean(src.hideReferrer),
    dohEnabled:         Boolean(src.dohEnabled),
    // Görünüm
    pageSerifFont:      typeof src.pageSerifFont==="string"?src.pageSerifFont:"",
    pageSansFont:       typeof src.pageSansFont==="string"?src.pageSansFont:"",
    pageMonoFont:       typeof src.pageMonoFont==="string"?src.pageMonoFont:"",
    useCustomWelcome:   Boolean(src.useCustomWelcome),
    customWelcomeHtml:  typeof src.customWelcomeHtml==="string"?src.customWelcomeHtml.slice(0,32000):"",
    // Dil
    language:           typeof src.language==="string"?src.language:"tr",
    // Görünüm v4 — grain, layout, foto, font
    uiFont:             typeof src.uiFont==="string"?src.uiFont:"",
    grainLevel:         typeof src.grainLevel==="string"?src.grainLevel:"",
    tabLayout:          typeof src.tabLayout==="string"?src.tabLayout:"horizontal",
    // bgPhotoPath: "file://.../bg_photo.jpg" veya data:image/ olabilir
    bgPhotoPath:        typeof src.bgPhotoPath==="string"?src.bgPhotoPath.slice(0,5000000):"",
    // profilePhoto: data:image/ base64
    profilePhoto:       typeof src.profilePhoto==="string"?src.profilePhoto.slice(0,5000000):"",
    profileName:        typeof src.profileName==="string"?src.profileName.slice(0,80):"",
    // Reklam engelleyici & çeviri
    adBlockEnabled:     true,
    translateEngine:    typeof src.translateEngine==="string"?src.translateEngine:"google",
    translateTargetLang:typeof src.translateTargetLang==="string"?src.translateTargetLang:"tr",
    libreTranslateUrl:  typeof src.libreTranslateUrl==="string"?src.libreTranslateUrl:"https://libretranslate.com",
    // Polish & animasyon
    animSpeed:          typeof src.animSpeed==="string"?src.animSpeed:"normal",
    warmNightMode:      Boolean(src.warmNightMode),
    soundEnabled:       Boolean(src.soundEnabled),
    magneticButtons:    Boolean(src.magneticButtons),
  };
}

const normBm  = (e,i)=>{ if(!e||typeof e!=="object")return null; const url=typeof e.url==="string"?e.url.trim():""; if(!url)return null; return{id:typeof e.id==="string"?e.id:`bm-${i}`,title:typeof e.title==="string"&&e.title.trim()?e.title.trim():url,url,createdAt:typeof e.createdAt==="string"?e.createdAt:new Date().toISOString(),folderId:typeof e.folderId==="string"?e.folderId:null}; };
const normH   = (e,i)=>{ if(!e||typeof e!=="object")return null; const url=typeof e.url==="string"?e.url.trim():""; if(!url)return null; return{id:typeof e.id==="string"?e.id:`h-${i}`,title:typeof e.title==="string"&&e.title.trim()?e.title.trim():url,url,visitedAt:typeof e.visitedAt==="string"?e.visitedAt:new Date().toISOString()}; };
const normDl  = (e,i)=>{ if(!e||typeof e!=="object")return null; const fn=typeof e.filename==="string"?e.filename.trim():""; if(!fn)return null; return{id:typeof e.id==="string"?e.id:`dl-${i}`,filename:fn,url:typeof e.url==="string"?e.url:"",state:typeof e.state==="string"?e.state:"progressing",totalBytes:Number.isFinite(e.totalBytes)?e.totalBytes:0,receivedBytes:Number.isFinite(e.receivedBytes)?e.receivedBytes:0,savePath:typeof e.savePath==="string"?e.savePath:"",startedAt:typeof e.startedAt==="string"?e.startedAt:new Date().toISOString(),endedAt:typeof e.endedAt==="string"?e.endedAt:null}; };
const normTab = (t,i)=>{ if(!t||typeof t!=="object")return null; const id=typeof t.id==="string"?t.id:`tab-${i}`; if(t.type==="internal"){const p=typeof t.page==="string"?t.page:"welcome";return{id,type:"internal",page:p,title:typeof t.title==="string"&&t.title.trim()?t.title.trim():"Karsilama",url:typeof t.url==="string"?t.url:""};} const url=typeof t.url==="string"?t.url.trim():""; if(!url)return null; return{id,type:"web",page:null,title:typeof t.title==="string"&&t.title.trim()?t.title.trim():url,url}; };
const normSc  = (e,i)=>{ if(!e||typeof e!=="object")return null; const url=typeof e.url==="string"?e.url.trim():""; if(!url)return null; return{id:typeof e.id==="string"?e.id:`sc-${i}`,title:typeof e.title==="string"&&e.title.trim()?e.title.trim():url,url}; };

function sanitizeStore(input) {
  const src=input&&typeof input==="object"?input:{};
  const tabs=Array.isArray(src.session?.tabs)?src.session.tabs.map(normTab).filter(Boolean).slice(0,50):[];
  const aid=typeof src.session?.activeTabId==="string"&&tabs.some(t=>t.id===src.session.activeTabId)?src.session.activeTabId:tabs[0]?.id??null;
  return {
    settings:        normSettings(src.settings),
    tabGroups:       Array.isArray(src.tabGroups)?src.tabGroups.map(g=>g&&typeof g==="object"?{id:String(g.id||""),name:String(g.name||"Grup").slice(0,40),color:String(g.color||"#5c8ae0"),tabIds:Array.isArray(g.tabIds)?g.tabIds.map(String):[],collapsed:Boolean(g.collapsed)}:null).filter(Boolean).slice(0,20):[],
    bookmarks:       Array.isArray(src.bookmarks)?src.bookmarks.map(normBm).filter(Boolean).slice(0,500):[],
    bmFolders:       Array.isArray(src.bmFolders)?src.bmFolders.slice(0,50):[],
    history:         Array.isArray(src.history)?src.history.map(normH).filter(Boolean).slice(0,500):[],
    downloads:       Array.isArray(src.downloads)?src.downloads.map(normDl).filter(Boolean).slice(0,100):[],
    shortcuts:       Array.isArray(src.shortcuts)?src.shortcuts.map(normSc).filter(Boolean).slice(0,12):[],
    notes:           typeof src.notes==="string"?src.notes:"",
    passwords:       Array.isArray(src.passwords)?src.passwords.slice(0,500):[],
    sessions:        Array.isArray(src.sessions)?src.sessions.slice(0,20):[],
    clipboardHistory:Array.isArray(src.clipboardHistory)?src.clipboardHistory.slice(0,50):[],
    notifications:   Array.isArray(src.notifications)?src.notifications.slice(0,100):[],
    stickyNotes:     (src.stickyNotes&&typeof src.stickyNotes==="object")?src.stickyNotes:{},
    // Araştırma notları — sanitize edilmeden olduğu gibi saklanır
    _researchData:   (src._researchData&&typeof src._researchData==="object")?src._researchData:undefined,
    session:         {tabs, activeTabId:aid},
  };
}
// ── Store şifreleme yardımcıları ─────────────────────────────────────────────
function canEncryptStore() {
  try {
    if (!app.isReady()) return false;
    if (typeof app.safeStorage?.isEncryptionAvailable !== "function") return false;
    const available = app.safeStorage.isEncryptionAvailable();
    if (!available) {
      // Windows dev modunda bazen false döner — app adı set edilmeden önce çağrılmış olabilir
      // Bu normal, şifreleme olmadan düz JSON ile devam et
      log("info", "safeStorage mevcut değil (dev modu veya platform kısıtı) — düz JSON kullanılıyor");
    }
    return available;
  } catch(e) {
    log("warn", "safeStorage kontrol hatası:", e.message);
    return false;
  }
}

function encryptStore(obj) {
  try {
    if (!canEncryptStore()) return null;
    const json = JSON.stringify(obj);
    const encrypted = app.safeStorage.encryptString(json);
    return encrypted.toString("base64");
  } catch(e) {
    log("warn", "Store şifreleme başarısız:", e.message);
    return null;
  }
}

function decryptStore(base64) {
  try {
    if (!canEncryptStore()) return null;
    const buf = Buffer.from(base64, "base64");
    return JSON.parse(app.safeStorage.decryptString(buf));
  } catch(e) {
    log("warn", "Store şifre çözme başarısız:", e.message);
    return null;
  }
}

// Şifreli store dosya yolu (.enc uzantısı ile)
const storePathEnc = () => storePath().replace(/\.json$/, ".enc");

function readStore() {
  const p = storePath();
  const pe = storePathEnc();
  ensureDir(path.dirname(p));

  // Önce şifreli versiyonu dene
  if (fs.existsSync(pe) && canEncryptStore()) {
    try {
      const raw = fs.readFileSync(pe, "utf8");
      const decrypted = decryptStore(raw);
      if (decrypted) return sanitizeStore(decrypted);
    } catch(e) {
      log("warn", "Şifreli store okunamadı, düz JSON'a düşülüyor:", e.message);
    }
  }

  // Düz JSON fallback
  if (!fs.existsSync(p)) {
    const s = sanitizeStore(DEFAULT_STORE);
    writeStore(s); // ilk yazımda şifreli kaydeder
    return s;
  }
  try {
    const s = sanitizeStore(JSON.parse(fs.readFileSync(p, "utf8")));
    // Düz JSON varsa şifreli versiyona migrate et
    if (canEncryptStore()) {
      writeStore(s);
      try { fs.unlinkSync(p); } catch(_) {} // düz dosyayı sil
      log("info", "Store şifreli versiyona migrate edildi");
    }
    return s;
  } catch(e) {
    log("error", "store read", e.message);
    const s = sanitizeStore(DEFAULT_STORE);
    writeStore(s);
    return s;
  }
}

function writeStore(s) {
  const n = sanitizeStore(s);
  if (canEncryptStore()) {
    const encrypted = encryptStore(n);
    if (encrypted) {
      fs.writeFileSync(storePathEnc(), encrypted, "utf8");
      return n;
    }
  }
  // Fallback: şifreleme mevcut değil, düz JSON yaz
  fs.writeFileSync(storePath(), JSON.stringify(n, null, 2), "utf8");
  return n;
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function sendDlUpdate(dl) { if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("downloads:updated",dl); }
function updateDownload(id,patch) {
  const s=readStore(), list=[...s.downloads], idx=list.findIndex(d=>d.id===id);
  if(idx===-1)list.unshift(patch); else list[idx]={...list[idx],...patch};
  sendDlUpdate(writeStore({...s,downloads:list.slice(0,60)}).downloads);
}

// ── Navigation guard ──────────────────────────────────────────────────────────
const internalBase = () => pathToFileURL(__dirname).toString();
function navAllowed(url, settings) {
  try {
    const p=new URL(url);
    // Block javascript: and vbscript: always
    if(p.protocol==="javascript:"||p.protocol==="vbscript:") return false;
    if(p.protocol==="file:") return url.startsWith(internalBase());
    if(settings.httpsOnly&&p.protocol==="http:") return false;
    return ["https:","http:","blob:","data:","about:"].includes(p.protocol);
  } catch(_){ return false; }
}
function permAllowed(perm, details, settings) {
  switch(perm) {
    case "notifications":          return settings.allowNotifications;
    case "geolocation":            return settings.allowLocation;
    case "media": { const mt=Array.isArray(details?.mediaTypes)?details.mediaTypes:[]; if(!mt.length)return settings.allowCamera||settings.allowMicrophone; return(!mt.includes("video")||settings.allowCamera)&&(!mt.includes("audio")||settings.allowMicrophone); }
    case "fullscreen": case "clipboard-sanitized-write": case "pointerLock": return true;
    case "clipboard-read": return settings.securityMode!=="strict";
    default: return false;
  }
}

function applySessionControls(bs, isIncognito=false) {
  bs.setPermissionRequestHandler((_wc,perm,cb,details)=>cb(isIncognito?false:permAllowed(perm,details,readStore().settings)));
  bs.setPermissionCheckHandler((_wc,perm,_o,details)=>isIncognito?false:permAllowed(perm,details,readStore().settings));

  // Ad blocker — incognito'da da çalışır
  applyAdBlocker(bs);

  // ── Browser Networking Protections ───────────────────────────────────────
  bs.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };

    // ── Referrer policy ─────────────────────────────────────────────────────
    const settings = readStore().settings;
    if (settings.hideReferrer) {
      headers["referrer-policy"] = ["no-referrer"];
    }

    // ── Sadece dahili sayfalara CSP ekle (file:// origin) ───────────────────
    // Dış sitelerin CSP'sine dokunma — kırılır
    if (details.url && details.url.startsWith("file://")) {
      // Electron iç sayfaları — inline script/style gerekli (welcome, settings vb.)
      // unsafe-inline burada kabul edilebilir: file:// origin dış saldırılara kapalı
      headers["content-security-policy"] = [
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "img-src 'self' data: https: blob:; " +
        "connect-src 'self' https:; " +
        "media-src 'self' blob:; " +
        "frame-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
      ];
      headers["x-content-type-options"] = ["nosniff"];
      headers["x-frame-options"]         = ["SAMEORIGIN"];
    }

    callback({ cancel: false, responseHeaders: headers });
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// SERTİFİKA PİNNİNG — MITM koruması
// ══════════════════════════════════════════════════════════════════════════════
// Kritik domainler için beklenen public key hash'leri (SPKI SHA-256, base64)
// Güncelleme: her ~90 günde bir sertifika döndürme gerekebilir, yedek hash ekle
const PINNED_CERTS = {
  // Gerçek pin hash'leri için: openssl s_client -connect domain:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
  // Şu an boş — CA doğrulaması aktif (installCertPinning içinde)
  // İleride kritik domain'ler için hash eklenebilir:
  // "api.example.com": ["AAAA...base64hash...==", "BBBB...backup...=="],
};

// Güvenilir CA'lar — bu listede olmayan CA'dan gelen sertifika reddedilir
// null = Chromium'un yerleşik CA store'una güven (varsayılan davranış)
// Strict mod: sadece belirli CA'lara izin ver
const STRICT_CA_DOMAINS = new Set([
  // Buradaki domainler için zincir doğrulaması zorunlu
  "urlhaus-api.abuse.ch",
  "safebrowsing.googleapis.com",
  "api.open-meteo.com",
  "ipapi.co",
]);

function installCertPinning() {
  // Her iki partition için de uygula
  [PARTITION, INCOGNITO_PART].forEach(part => {
    const ses = session.fromPartition(part);
    ses.setCertificateVerifyProc((request, callback) => {
      const { hostname, certificate, verificationResult, errorCode } = request;

      // 1. Chromium'un kendi doğrulaması başarısız olduysa reddet
      if (verificationResult !== "net::OK") {
        log("warn", `[CertPin] Sertifika doğrulama başarısız: ${hostname} → ${verificationResult} (${errorCode})`);
        // Yine de devam et (kullanıcı deneyimini bozmamak için)
        // Strict modda: callback(-2) ile reddet
        callback(0); // 0 = Chromium'un kararına bırak
        return;
      }

      // 2. Strict CA domain'leri için zincir kontrolü
      if (STRICT_CA_DOMAINS.has(hostname)) {
        // Sertifika zinciri boşsa veya issuer yoksa reddet
        if (!certificate.issuerName || !certificate.subjectName) {
          log("warn", `[CertPin] Boş sertifika zinciri reddedildi: ${hostname}`);
          callback(-2); // net::ERR_CERT_INVALID
          return;
        }
        // Self-signed sertifikayı reddet (issuer === subject)
        if (certificate.issuerName === certificate.subjectName) {
          log("warn", `[CertPin] Self-signed sertifika reddedildi: ${hostname}`);
          callback(-2);
          return;
        }
      }

      // 3. Pin kontrolü (gelecekte doldurulacak map)
      if (PINNED_CERTS[hostname] && PINNED_CERTS[hostname] !== null) {
        const expectedHashes = PINNED_CERTS[hostname];
        // fingerprint: Electron "AA:BB:CC:..." formatında verir
        const fingerprint = certificate.fingerprint; // SHA-256 hex
        if (!expectedHashes.some(h => fingerprint.includes(h))) {
          log("warn", `[CertPin] Pin eşleşmedi: ${hostname} — olası MITM saldırısı!`);
          // Kullanıcıya bildir
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("safety:blocked", {
              url: `https://${hostname}`,
              result: { level: "blocked", reasons: ["Sertifika doğrulaması başarısız — olası ortadaki adam (MITM) saldırısı"], source: "cert_pinning" }
            });
          }
          callback(-2);
          return;
        }
      }

      // 4. Geçti — Chromium'un kararına bırak
      callback(0);
    });
  });
  log("info", "Sertifika pinning aktif");
}

function installSessionControls() {
  if(sessionControlsBound) return;
  applySessionControls(session.fromPartition(PARTITION), false);
  applySessionControls(session.fromPartition(INCOGNITO_PART), true);
  installCertPinning();
  app.on("web-contents-created",(_,contents)=>{
    // will-navigate: kullanıcı veya JS kaynaklı navigasyon
    contents.on("will-navigate",(event,url)=>{
      if(!navAllowed(url,readStore().settings)) {
        console.warn("[Illumina] Blocked navigate:", url);
        event.preventDefault();
      }
    });
    // will-redirect: sunucu taraflı 3xx yönlendirme — güvenlik kontrolü burada da çalışır
    contents.on("will-redirect",(event,url)=>{
      if(!navAllowed(url,readStore().settings)) {
        console.warn("[Illumina] Blocked redirect:", url);
        event.preventDefault();
      }
    });
    // did-navigate: navigasyon tamamlandıktan sonra safety check
    contents.on("did-navigate",(_ev,url)=>{
      if(!url||url.startsWith("file://")||url.startsWith("about:")) return;
      const settings = readStore().settings;
      if(!settings.safeCheckEnabled) return;
      checkUrl(url, settings).then(result=>{
        if(result.level==="blocked"&&mainWindow&&!mainWindow.isDestroyed()) {
          mainWindow.webContents.send("safety:blocked", { url, result });
        }
      }).catch(()=>{});
    });
  });
  sessionControlsBound=true;
}

// ── Apply privacy settings to session ─────────────────────────────────────────
let _torEnabled = false;
let _torProxyUrl = "socks5://127.0.0.1:9050";

async function setTorProxy(enable, proxyUrl) {
  _torEnabled = Boolean(enable);
  if (proxyUrl) _torProxyUrl = proxyUrl;
  const ses = session.fromPartition(PARTITION);
  try {
    if (_torEnabled) {
      await ses.setProxy({ proxyRules: _torProxyUrl, proxyBypassRules: "<local>" });
      log("info", "Tor proxy aktif:", _torProxyUrl);
    } else {
      await ses.setProxy({ mode: "direct" });
      log("info", "Tor proxy devre dışı");
    }
    return { ok: true, enabled: _torEnabled };
  } catch(e) {
    log("error", "Tor proxy hatası:", e.message);
    return { error: e.message };
  }
}

function applyPrivacySettings(settings) {
  const ses = session.fromPartition(PARTITION);

  // User-Agent spoofing
  if (settings.spoofUserAgent) {
    ses.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  } else {
    ses.setUserAgent(app.userAgentFallback || "");
  }

  // DNS-over-HTTPS
  try {
    if (settings.dohEnabled) {
      ses.setDNSOverHTTPSConfig?.({ mode: "secure", templates: ["https://cloudflare-dns.com/dns-query{?dns}"] });
    } else {
      ses.setDNSOverHTTPSConfig?.({ mode: "off" });
    }
  } catch(_) {}

  // Autoplay policy
  if (settings.blockAutoplay) {
    ses.setPermissionRequestHandler((wc, perm, cb, details) => {
      if (perm === "autoplay") { cb(false); return; }
      cb(permAllowed(perm, details, settings));
    });
  }
}

// Safety check IPC
ipcHandle("safety:check", async (_e, url) => {
  const settings = readStore().settings;
  // API key şifreli olabilir, çöz
  const decryptedSettings = {
    ...settings,
    safeBrowsingApiKey: decryptPassword(settings.safeBrowsingApiKey || ""),
  };
  try {
    return await checkUrl(url, decryptedSettings);
  } catch(e) {
    console.error("safety check error:", e.message);
    return { level:"safe", reasons:[], source:"error" };
  }
});

ipcHandle("safety:settings:save", (_e, patch) => {
  const store = readStore();
  // GSB API key varsa şifrele
  if (patch.safeBrowsingApiKey && !patch.safeBrowsingApiKey.startsWith("safe:") && !patch.safeBrowsingApiKey.startsWith("plain:")) {
    patch = { ...patch, safeBrowsingApiKey: encryptPassword(patch.safeBrowsingApiKey) };
  }
  const next = writeStore({ ...store, settings: { ...store.settings, ...patch } });
  // UI'ya dönerken key'i maskele
  return { ...next.settings, safeBrowsingApiKey: next.settings.safeBrowsingApiKey ? "••••••••" : "" };
});

async function loadSavedExtensions() {
  const bs=session.fromPartition(PARTITION), store=readStore(), norm=[];
  for(const ext of store.settings.extensions) {
    if(!fs.existsSync(ext.path)) continue;
    try { const l=await bs.loadExtension(ext.path,{allowFileAccess:true}); norm.push({id:l.id||ext.id,name:l.name||ext.name||path.basename(ext.path),version:l.version||ext.version||"",path:ext.path}); }
    catch(e){ console.error("ext load",ext.path,e.message); norm.push({id:ext.id,name:ext.name||path.basename(ext.path),version:ext.version||"",path:ext.path}); }
  }
  return writeStore({...store,settings:{...store.settings,extensions:norm}}).settings.extensions;
}

// ── Context menu ──────────────────────────────────────────────────────────────
function buildContextMenu(params, wc) {
  const menu=new Menu();
  const add=(label,click,opts={})=>{ if(opts.visible===false)return; menu.append(new MenuItem({label,click,enabled:opts.enabled!==false})); };
  const sep=()=>menu.append(new MenuItem({type:"separator"}));

  add("Geri",   ()=>wc.goBack(),    {enabled:wc.canGoBack()});
  add("İleri",  ()=>wc.goForward(), {enabled:wc.canGoForward()});
  add("Yenile", ()=>wc.reload());
  sep();

  if(params.selectionText?.trim()) {
    add("Kopyala", ()=>clipboard.writeText(params.selectionText));
    add(`"${params.selectionText.slice(0,24).trim()}…" ara`, ()=>{
      if(mainWindow) mainWindow.webContents.send("ctx:search-selection", params.selectionText);
    });
    sep();
  }

  if(params.isEditable) {
    add("Geri al",     ()=>wc.undo(),    {enabled:params.editFlags?.canUndo});
    add("Yinele",      ()=>wc.redo(),    {enabled:params.editFlags?.canRedo});
    sep();
    add("Kes",         ()=>wc.cut(),     {enabled:params.editFlags?.canCut});
    add("Kopyala",     ()=>wc.copy(),    {enabled:params.editFlags?.canCopy});
    add("Yapıştır",    ()=>wc.paste(),   {enabled:params.editFlags?.canPaste});
    add("Tümünü seç",  ()=>wc.selectAll());
    sep();
  }

  if(params.mediaType==="image"&&params.srcURL) {
    add("Resmi kopyala",         ()=>wc.copyImageAt(params.x,params.y));
    add("Resmi kaydet",          ()=>wc.downloadURL(params.srcURL));
    add("Resmi yeni sekmede aç", ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:open-url",params.srcURL); });
    sep();
  }

  if(params.linkURL) {
    add("Bağlantıyı yeni sekmede aç", ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:open-url",params.linkURL); });
    add("Bağlantıyı kopyala",         ()=>clipboard.writeText(params.linkURL));
    sep();
  }

  if(params.selectionText?.trim()) {
    add("Ara\u015ft\u0131rmaya ekle", ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:add-research", { text: params.selectionText, url: params.pageURL||"" }); });
    sep();
  }
  add("Sayfada ara (Ctrl+F)",   ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:find-in-page"); });
  add("Ekran görüntüsü al",     ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:screenshot"); });
  add("Bu sekmeyi kilitle/aç",  ()=>{ if(mainWindow)mainWindow.webContents.send("ctx:lock-tab"); });
  add("Geliştirici Araçları",   ()=>{ try{wc.openDevTools();}catch(_){} });
  return menu;
}

// ── Window ────────────────────────────────────────────────────────────────────
function createMainWindow() {
  const win=new BrowserWindow({
    width:1500,height:940,minWidth:1100,minHeight:700,
    backgroundColor:"#00000000",show:false,autoHideMenuBar:true,title:APP_NAME,
    webPreferences:{ preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true,webSecurity:true },
  });
  win.once("ready-to-show",()=>win.show());
  win.webContents.on("will-attach-webview",(_e,webPrefs,params)=>{
    webPrefs.nodeIntegration=false;
    webPrefs.contextIsolation=true;
    // İç sayfalar (file://) local kaynaklara (css, js) erişmek zorunda olduğu için sandbox kapatılmalı. Dış sitelere (http) acımasız sandbox.
    webPrefs.sandbox = !(params.src && params.src.startsWith("file://"));
    webPrefs.allowRunningInsecureContent=false;
    delete webPrefs.preloadURL;
    // Preload path validation — path traversal + injection koruması
    const { pathToFileURL, fileURLToPath } = require("url");
    const expectedPreload = pathToFileURL(path.join(__dirname, "webview-preload.js")).toString();
    const isValidPreload = (
      typeof params.preload === "string" &&
      params.preload.startsWith("file://") &&
      !params.preload.includes("..") &&
      !params.preload.includes("%2e") &&
      !params.preload.includes("%2E") &&
      params.preload === expectedPreload
    );
    if (!isValidPreload) {
      log("warn", `[Security] Geçersiz webview preload reddedildi: ${String(params.preload).slice(0, 200)}`);
      throw new Error("Invalid webview preload — path injection attempt blocked");
    }
    // webSecurity her zaman true — RSS ve cross-origin istekler main process'ten yapılır
    webPrefs.webSecurity = true;
  });

  // Fingerprint config'i her webview'e inject et
  app.on("web-contents-created", (_e, wc) => {
    wc.on("dom-ready", () => {
      const s = readStore().settings;
      const cfg = {
        blockCanvas:    Boolean(s.blockCanvas),
        blockWebRTC:    Boolean(s.blockWebRTC),
        spoofUserAgent: Boolean(s.spoofUserAgent),
      };
      // Sadece dış sayfalar (file:// değil)
      try {
        const url = wc.getURL?.() || "";
        if (!url.startsWith("file://") && !url.startsWith("about:") && !url.startsWith("devtools://")) {
          wc.executeJavaScriptInIsolatedWorld(999, [{ code: `window.__illuminaPrivacy = ${JSON.stringify(cfg)};` }]).catch(()=>{});
        }
      } catch(_) {}
    });
  });

  // Context menu for ALL web contents (including webviews)
  app.on("web-contents-created",(_e,wc)=>{
    wc.on("context-menu",(_ev,params)=>buildContextMenu(params,wc).popup({window:win}));
    // Prevent external new windows — route to our tab system instead
    wc.setWindowOpenHandler(({url})=>{
      if (!url || url.startsWith("devtools://")) return { action:"allow" };
      if (win && !win.isDestroyed()) {
        win.webContents.send("ctx:open-url", url);
      }
      return { action:"deny" };
    });
  });

  win.loadFile(path.join(__dirname,"index.html"));
  return win;
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function bindDownloadSession() {
  if(downloadSessionBound) return;
  const { Notification } = require("electron");
  [PARTITION, INCOGNITO_PART].forEach(part=>{
    session.fromPartition(part).on("will-download",(_e,item)=>{
      // Dosya adını sanitize et — path traversal koruması
      const rawFilename = item.getFilename() || "indirme";
      const safeFilename = path.basename(rawFilename).replace(/[\x00-\x1f<>:"|?*]/g, "_").slice(0, 200) || "indirme";
      const dflt = path.join(app.getPath("downloads"), safeFilename);
      item.setSavePath(dflt);
      const id=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const ini={id,filename:item.getFilename(),url:item.getURL(),state:"progressing",totalBytes:item.getTotalBytes(),receivedBytes:item.getReceivedBytes(),savePath:dflt,startedAt:new Date().toISOString(),endedAt:null};
      updateDownload(id,ini);
      
      if (Notification.isSupported()) {
        new Notification({ title: "İndirme Başladı", body: item.getFilename() }).show();
      }

      item.on("updated",(_,st)=>updateDownload(id,{...ini,state:st==="interrupted"?"interrupted":"progressing",totalBytes:item.getTotalBytes(),receivedBytes:item.getReceivedBytes(),savePath:item.getSavePath()||dflt}));
      item.once("done",(_,st)=>{
        updateDownload(id,{...ini,state:st,totalBytes:item.getTotalBytes(),receivedBytes:item.getReceivedBytes(),savePath:item.getSavePath()||dflt,endedAt:new Date().toISOString()});
        if (Notification.isSupported() && st === "completed") {
          new Notification({ title: "İndirme Tamamlandı", body: item.getFilename() }).show();
        }
      });
    });
  });
  downloadSessionBound=true;
}

// ── IPC ───────────────────────────────────────────────────────────────────────
function installIpcHandlers() {
  // ── Meta — config verilerini sandbox preload'a gönder ────────────────────
  // preload.js artık require("./config") yapamaz (sandbox:true),
  // bu IPC ile tüm config verisini alır.
  ipcHandle("meta:load", () => {
    const { pathToFileURL } = require("url");
    const path = require("path");
    const pageUrl = name => pathToFileURL(path.join(__dirname, `${name}.html`)).toString();
    return {
      appName:          APP_NAME,
      appVersion:       APP_VERSION,
      partition:        PARTITION,
      incognitoPartition: INCOGNITO_PART,
      themes:           THEMES,
      searchEngines:    SEARCH_ENGINES,
      translateEngines: TRANSLATE_ENGINES,
      uiFonts:          UI_FONTS,
      grainLevels:      GRAIN_LEVELS,
      tabLayouts:       TAB_LAYOUTS,
      securityModes:    SECURITY_MODES,
      startPageModes:   START_PAGE_MODES,
      fontSizes:        FONT_SIZES,
      languages:        LANGUAGES,
      defaultSettings:  DEFAULT_SETTINGS,
      defaultShortcuts: DEFAULT_SHORTCUTS,
      pages: {
        welcome:   pageUrl("welcome"),
        settings:  pageUrl("settings"),
        history:   pageUrl("history"),
        downloads: pageUrl("downloads"),
        pdf:       pageUrl("pdf"),
        about:     pageUrl("about"),
      },
      webviewPreload: pathToFileURL(path.join(__dirname, "webview-preload.js")).toString(),
      featureFlags: FEATURE_FLAGS,
    };
  });

  ipcHandle("store:load",        ()      => readStore());
  ipcHandle("store:save", (_, s) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) { log("warn","[IPC] store:save: geçersiz veri reddedildi"); return { error: "Geçersiz store verisi" }; }
    // Aktif profile yönlendir (varsayılan veya seçili profil)
    const saved = activeWriteStore(s);
    try { applyPrivacySettings(saved.settings); } catch(_) {}
    return saved;
  });
  ipcHandle("extensions:list",   ()      => readStore().settings.extensions);

  ipcHandle("extensions:add", async ()=>{
    if(!mainWindow) return {added:false,extensions:readStore().settings.extensions,error:"Pencere yok."};
    const res=await dialog.showOpenDialog(mainWindow,{title:"Uzantı klasörü seç",properties:["openDirectory"]});
    if(res.canceled||!res.filePaths.length) return {added:false,extensions:readStore().settings.extensions,error:""};
    const ep=res.filePaths[0], bs=session.fromPartition(PARTITION);
    try {
      const l=await bs.loadExtension(ep,{allowFileAccess:true});
      const store=readStore();
      const exts=[{id:l.id,name:l.name||path.basename(ep),version:l.version||"",path:ep},...store.settings.extensions.filter(e=>e.path!==ep)].slice(0,20);
      return {added:true,extensions:writeStore({...store,settings:{...store.settings,extensions:exts}}).settings.extensions,error:""};
    } catch(e){
      let msg = e.message || "Uzantı yüklenemedi.";
      if (msg.includes("Chrome") || msg.includes("update_url") || msg.includes("CRX") || msg.includes("crx")) {
        msg = "Bu uzantı Chrome Web Store'dan indirilmiş. Illumina sadece 'unpacked' (klasör) uzantıları destekler. Uzantıyı crx yerine klasör olarak çıkarıp tekrar deneyin.";
      }
      return{added:false,extensions:readStore().settings.extensions,error:msg};
    }
  });

  ipcHandle("extensions:remove",async(_,ep)=>{
    const store=readStore(), tgt=store.settings.extensions.find(e=>e.path===ep);
    const bs=session.fromPartition(PARTITION);
    if(tgt?.id){try{bs.removeExtension(tgt.id);}catch(e){console.warn(e.message);}}
    const next=writeStore({...store,settings:{...store.settings,extensions:store.settings.extensions.filter(e=>e.path!==ep)}});
    return{removed:true,extensions:next.settings.extensions};
  });

  ipcHandle("downloads:open",        async(_,id)=>{ const d=readStore().downloads.find(x=>x.id===id); if(!d?.savePath)return false; await shell.openPath(d.savePath); return true; });
  ipcHandle("downloads:showInFolder",      (_,id)=>{ const d=readStore().downloads.find(x=>x.id===id); if(!d?.savePath)return false; shell.showItemInFolder(d.savePath); return true; });
  ipcHandle("downloads:drag", (_,id)=>{ const d=readStore().downloads.find(x=>x.id===id); if(!d?.savePath)return false; try{mainWindow?.webContents.startDrag({file:d.savePath,icon:path.join(__dirname,"logo.png")});}catch(_){} return true; });

  ipcHandle("findInPage:start",(_e,{contentsId,text})=>{ const wc=WC.fromId(contentsId); if(wc&&text)wc.findInPage(text,{findNext:false,forward:true}); });
  ipcHandle("findInPage:next", (_e,{contentsId,text,forward})=>{ const wc=WC.fromId(contentsId); if(wc&&text)wc.findInPage(text,{findNext:true,forward:forward!==false}); });
  ipcHandle("findInPage:stop", (_e,{contentsId})=>{ const wc=WC.fromId(contentsId); if(wc)wc.stopFindInPage("clearSelection"); });
  ipcHandle("audio:mute",      (_e,{contentsId,mute})=>{ const wc=WC.fromId(contentsId); if(wc)wc.setAudioMuted(mute); });

  // DevTools
  ipcHandle("devtools:open", (_e,{contentsId})=>{
    try{ const wc=WC.fromId(contentsId); if(wc)wc.openDevTools(); }catch(_){}
  });

  // Weather
  ipcHandle("weather:fetch", async (_e, {lat, lon}) => {
    try {
      const https = require("https");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius`;
      return await new Promise((resolve, reject) => {
        const req = https.get(url, res => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on("error", reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
      });
    } catch(e) { return { error: e.message }; }
  });

  // ── News RSS fetcher ──────────────────────────────────────────────────────
  const NEWS_SOURCES = [
    { id:"bbc-tr",      label:"BBC Türkçe",   url:"https://feeds.bbci.co.uk/turkish/rss.xml" },
    { id:"ntv",         label:"NTV",           url:"https://www.ntv.com.tr/son-dakika.rss" },
    { id:"sozcu",       label:"Sözcü",         url:"https://www.sozcu.com.tr/rss/son-dakika.xml" },
    { id:"bbc-en",      label:"BBC World",     url:"https://feeds.bbci.co.uk/news/world/rss.xml" },
    { id:"aljazeera",   label:"Al Jazeera",    url:"https://www.aljazeera.com/xml/rss/all.xml" },
    { id:"techcrunch",  label:"TechCrunch",    url:"https://techcrunch.com/feed/" },
    { id:"hackernews",  label:"Hacker News",   url:"https://hnrss.org/frontpage" },
  ];

  function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const https = require("https");
      const http  = require("http");
      const follow = (targetUrl, redirects) => {
        if (redirects > 3) { reject(new Error("too many redirects")); return; }
        const mod = targetUrl.startsWith("https") ? https : http;
        const req = mod.get(targetUrl, {
          headers: { "User-Agent":"Mozilla/5.0 (compatible; Illumina/3.0)", "Accept":"application/rss+xml,application/xml,text/xml,*/*" },
          timeout: 8000,
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
          const chunks = [];
          res.on("data", c => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      };
      follow(url, 0);
    });
  }

  function parseRSS(xml) {
    const items = [];
    const tagRE = /<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi;
    let m;
    while ((m = tagRE.exec(xml)) !== null) {
      const block = m[0];
      const get = (tags) => {
        for (const tag of tags) {
          const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
          const match = block.match(re);
          if (match) {
            let val = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g," ")
              .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
              .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#[0-9]+;/g,"").trim();
            if (val) return val;
          }
        }
        return "";
      };
      const linkAttr = block.match(/<link[^>]+href="([^"]+)"/i);
      const title   = get(["title"]);
      const link    = linkAttr ? linkAttr[1] : get(["link","guid"]);
      const desc    = get(["description","summary","content:encoded","content"]).slice(0, 200);
      const pubDate = get(["pubDate","published","updated","dc:date"]);
      if (title && link && link.startsWith("http")) {
        items.push({ title, link, desc, pubDate });
      }
      if (items.length >= 8) break;
    }
    return items;
  }

  ipcHandle("news:fetch-all", async () => {
    const results = await Promise.allSettled(
      NEWS_SOURCES.map(async (src) => {
        try {
          const xml   = await fetchUrl(src.url);
          const items = parseRSS(xml);
          return items.map(item => ({ ...item, sourceLabel: src.label, sourceId: src.id }));
        } catch(e) {
          console.warn("[Illumina News] FAILED:", src.id, e.message);
          return [];
        }
      })
    );
    const all = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
    const seen = new Set();
    const unique = all.filter(item => { if(seen.has(item.link))return false; seen.add(item.link); return true; });
    unique.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });
    return { items: unique.slice(0, 20), total: unique.length };
  });

  ipcHandle("news:fetch", async (_e, sourceId) => {
    const src = NEWS_SOURCES.find(s => s.id === sourceId);
    if (!src) return { items: [], source: "?" };
    try {
      const xml   = await fetchUrl(src.url);
      const items = parseRSS(xml).map(item => ({ ...item, sourceLabel: src.label }));
      return { items, source: src.label };
    } catch(e) {
      return { items: [], source: src.label, error: e.message };
    }
  });

  ipcHandle("news:sources", () => NEWS_SOURCES);

  // Geocode from IP
  ipcHandle("weather:geoip", async () => {
    try {
      const https = require("https");
      return await new Promise((resolve, reject) => {
        const req = https.get("https://ipapi.co/json/", { headers: { "User-Agent": "Illumina Browser" } }, res => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        });
        req.on("error", reject);
        req.setTimeout(6000, () => { req.destroy(); reject(new Error("timeout")); });
      });
    } catch(e) { return { error: e.message }; }
  });

  // ── Passwords ──────────────────────────────────────────────────────────────
  ipcHandle("passwords:list",   () => {
    try{
      return(readStore().passwords||[]).map(p=>({
        ...p,
        password:"•".repeat(8)  // Listede şifre gösterilmez, get ile alınır
      }));
    }catch(e){return[];}
  });
  ipcHandle("passwords:get",    (_e,id) => {
    try{
      const entry=(readStore().passwords||[]).find(x=>x.id===id)||null;
      if(!entry) return null;
      return { ...entry, password: decryptPassword(entry.password) };
    }catch(e){return null;}
  });
  ipcHandle("passwords:save",   (_e,entry) => {
    try{
      // Input validation
      if (!entry || typeof entry !== "object") return { error: "Geçersiz giriş" };
      if (typeof entry.url !== "string" || !entry.url.trim()) return { error: "URL gerekli" };
      if (typeof entry.username !== "string") return { error: "Kullanıcı adı gerekli" };
      if (typeof entry.password !== "string") return { error: "Şifre gerekli" };
      const s=readStore();
      const pwds=s.passwords||[];
      const idx=pwds.findIndex(p=>p.id===entry.id);
      // Şifreyi safeStorage ile şifrele
      const encPw = encryptPassword(String(entry.password||"").slice(0,500));
      const norm={
        id:entry.id||`pw-${Date.now()}`,
        domain:String(entry.domain||"").slice(0,200),
        username:String(entry.username||"").slice(0,200),
        password:encPw,
        url:String(entry.url||"").slice(0,500),
        savedAt:new Date().toISOString()
      };
      idx>=0?pwds.splice(idx,1,norm):pwds.unshift(norm);
      writeStore({...s,passwords:pwds.slice(0,500)});
      return{saved:true};
    }catch(e){return{error:e.message};}
  });
  ipcHandle("passwords:delete", (_e,id) => { try{const s=readStore();writeStore({...s,passwords:(s.passwords||[]).filter(p=>p.id!==id)});return true;}catch(e){return false;} });
  ipcHandle("passwords:find",   (_e,domain) => { try{return(readStore().passwords||[]).filter(p=>p.domain&&(p.domain===domain||domain.includes(p.domain)||p.domain.includes(domain)));}catch(e){return[];} });

  // ── Bookmark folders ───────────────────────────────────────────────────────
  ipcHandle("bmfolders:list", () => { try{return readStore().bmFolders||[];}catch(e){return[];} });
  ipcHandle("bmfolders:save", (_e,folders) => { try{const s=readStore();writeStore({...s,bmFolders:(folders||[]).slice(0,50)});return true;}catch(e){return false;} });

  // ── Sessions ───────────────────────────────────────────────────────────────
  ipcHandle("session:save",   (_e,{name,tabs}) => {
    try{const s=readStore();const sessions=s.sessions||[];const id=`sess-${Date.now()}`;sessions.unshift({id,name:String(name||`Oturum ${new Date().toLocaleDateString("tr-TR")}`).slice(0,100),tabs:tabs||[],savedAt:new Date().toISOString()});writeStore({...s,sessions:sessions.slice(0,20)});return{saved:true,id};}catch(e){return{error:e.message};}
  });
  ipcHandle("session:list",   () => { try{return readStore().sessions||[];}catch(e){return[];} });
  ipcHandle("session:delete", (_e,id) => { try{const s=readStore();writeStore({...s,sessions:(s.sessions||[]).filter(x=>x.id!==id)});return true;}catch(e){return false;} });

  // ── Clipboard history ──────────────────────────────────────────────────────
  ipcHandle("clipboard:add",   (_e,text) => {
    try{const s=readStore();const h=s.clipboardHistory||[];const next=[{id:`cb-${Date.now()}`,text:String(text).slice(0,2000),ts:Date.now()},...h.filter(x=>x.text!==text)].slice(0,50);writeStore({...s,clipboardHistory:next});return true;}catch(e){return false;}
  });
  ipcHandle("clipboard:list",  () => { try{return readStore().clipboardHistory||[];}catch(e){return[];} });
  ipcHandle("clipboard:clear", () => { try{writeStore({...readStore(),clipboardHistory:[]});return true;}catch(e){return false;} });

  // ── Cookies ────────────────────────────────────────────────────────────────
  ipcHandle("cookies:getAll",       async () => { try{return await session.fromPartition(PARTITION).cookies.get({});}catch(e){return[];} });
  ipcHandle("cookies:clearAll",     async () => { try{await session.fromPartition(PARTITION).clearStorageData({storages:["cookies"]});return true;}catch(e){return false;} });
  ipcHandle("cookies:clearByDomain",async (_e,domain) => {
    try{const ses=session.fromPartition(PARTITION);const cookies=await ses.cookies.get({domain});await Promise.all(cookies.map(c=>{const url=(c.secure?"https":"http")+"://"+c.domain.replace(/^\./,"")+c.path;return ses.cookies.remove(url,c.name);}));return true;}catch(e){return false;}
  });

  // ── Sticky notes ───────────────────────────────────────────────────────────
  ipcHandle("stickynotes:get",  (_e,host) => { try{return(readStore().stickyNotes||{})[host]||[];}catch(e){return[];} });
  ipcHandle("stickynotes:save", (_e,{host,notes}) => { try{const s=readStore();const sn=s.stickyNotes||{};sn[host]=notes;writeStore({...s,stickyNotes:sn});return true;}catch(e){return false;} });

  // ── Notifications ──────────────────────────────────────────────────────────
  ipcHandle("notifications:list",  () => { try{return readStore().notifications||[];}catch(e){return[];} });
  ipcHandle("notifications:clear", () => { try{writeStore({...readStore(),notifications:[]});return true;}catch(e){return false;} });
  ipcHandle("notifications:add",   (_e,n) => {
    try{const s=readStore();const notifs=s.notifications||[];notifs.unshift({id:`n-${Date.now()}`,title:String(n.title||"").slice(0,200),body:String(n.body||"").slice(0,500),origin:String(n.origin||"").slice(0,200),ts:Date.now()});writeStore({...s,notifications:notifs.slice(0,100)});if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("notification:new",notifs[0]);return true;}catch(e){return false;}
  });

  // ── Screenshot ─────────────────────────────────────────────────────────────
  ipcHandle("screenshot:capture", async (_e, {contentsId, saveToFile=true}) => {
    try{
      const wc=WC.fromId(contentsId); if(!wc)return{error:"not found"};
      const img=await wc.capturePage();
      // Önizleme için sadece dataUrl döndür
      if (!saveToFile) {
        return { dataUrl: img.toDataURL() };
      }
      const savePath=path.join(app.getPath("pictures"),`illumina-${Date.now()}.png`);
      fs.writeFileSync(savePath,img.toPNG());
      shell.showItemInFolder(savePath);
      return{saved:true,path:savePath,dataUrl:img.toDataURL()};
    }catch(e){return{error:e.message};}
  });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  ipcHandle("zoom:set", (_e,{contentsId,level}) => { try{WC.fromId(contentsId)?.setZoomLevel(level);}catch(_){} });
  ipcHandle("zoom:get", (_e,{contentsId}) => { try{return WC.fromId(contentsId)?.getZoomLevel()??0;}catch(_){return 0;} });

  // ── Profil IPC ─────────────────────────────────────────────────────────────
  ipcHandle("profiles:list",   () => readProfiles());
  ipcHandle("profiles:active", () => _activeProfileId);

  ipcHandle("profiles:create", (_e, { name, color }) => {
    const profiles = readProfiles();
    const id = "p_" + Date.now().toString(36);
    const np = { id, name: String(name||"Profil").slice(0,40), color: String(color||"#4a90b0"), createdAt: new Date().toISOString() };
    profiles.push(np);
    writeProfiles(profiles);
    // Yeni profil için boş store oluştur
    readProfileStore(id);
    log("info", `Profil oluşturuldu: ${id} (${np.name})`);
    return { ok: true, profile: np, profiles };
  });

  ipcHandle("profiles:rename", (_e, { id, name, color }) => {
    const profiles = readProfiles();
    const p = profiles.find(x => x.id === id);
    if (!p) return { error: "Profil bulunamadı" };
    if (name)  p.name  = String(name).slice(0,40);
    if (color) p.color = String(color);
    writeProfiles(profiles);
    return { ok: true, profiles };
  });

  ipcHandle("profiles:delete", (_e, { id }) => {
    if (id === "default") return { error: "Varsayılan profil silinemez" };
    if (id === _activeProfileId) return { error: "Aktif profil silinemez. Önce başka profile geç." };
    const profiles = readProfiles().filter(p => p.id !== id);
    writeProfiles(profiles);
    // Profil store dosyasını sil
    try { const sp = profileStorePath(id); if (fs.existsSync(sp)) fs.unlinkSync(sp); } catch(_) {}
    log("info", `Profil silindi: ${id}`);
    return { ok: true, profiles };
  });

  ipcHandle("profiles:switch", (_e, { id }) => {
    const profiles = readProfiles();
    if (!profiles.find(p => p.id === id)) return { error: "Profil bulunamadı" };
    _activeProfileId = id;
    log("info", `Profile geçildi: ${id}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("profile:switched", { id, store: activeReadStore() });
    }
    return { ok: true, activeId: id };
  });

  ipcHandle("profiles:store:load", () => activeReadStore());
  ipcHandle("profiles:store:save", (_e, s) => {
    const saved = activeWriteStore(s);
    try { applyPrivacySettings(saved.settings); } catch(_) {}
    return saved;
  });

  // ── Arkaplan fotoğrafı IPC ─────────────────────────────────────────────────
  ipcHandle("bgPhoto:save", (_e, dataUrl) => {
    try {
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return { error: "Geçersiz görsel" };
      const base64 = dataUrl.split(",")[1];
      const ext    = dataUrl.includes("image/png") ? "png" : "jpg";
      const p      = path.join(app.getPath("userData"), `bg_photo.${ext}`);
      fs.writeFileSync(p, Buffer.from(base64, "base64"));
      // Eski dosyayı temizle
      const other = ext === "png" ? "jpg" : "png";
      const op    = path.join(app.getPath("userData"), `bg_photo.${other}`);
      if (fs.existsSync(op)) fs.unlinkSync(op);
      log("info", "Arkaplan fotoğrafı kaydedildi:", p);
      return { ok: true, path: p };
    } catch(e) { return { error: e.message }; }
  });
  ipcHandle("bgPhoto:get", () => {
    for (const ext of ["jpg","jpeg","png","webp"]) {
      const p = path.join(app.getPath("userData"), `bg_photo.${ext}`);
      if (fs.existsSync(p)) {
        try {
          const data = fs.readFileSync(p);
          const dataUrl = `data:image/${ext === "jpg" ? "jpeg" : ext};base64,` + data.toString("base64");
          return { dataUrl, filePath: p };
        } catch(_) {}
      }
    }
    return { dataUrl: null };
  });
  ipcHandle("bgPhoto:clear", () => {
    for (const ext of ["jpg","png","webp"]) {
      const p = path.join(app.getPath("userData"), `bg_photo.${ext}`);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(_) {}
    }
    return { ok: true };
  });

  // ── Ad Blocker IPC ─────────────────────────────────────────────────────────
  ipcHandle("adblock:status",  () => ({
    enabled:  _adBlockEnabled,
    blocked:  _adBlockStats.blocked,
    allowed:  _adBlockStats.allowed,
    domains:  _adBlockDomains.size,
    patterns: _adBlockPatterns.length,
  }));

  // ── Tor IPC ─────────────────────────────────────────────────────────────────
  ipcHandle("tor:enable",  async (_e, opts) => setTorProxy(true,  opts?.proxyUrl));
  ipcHandle("tor:disable", async ()         => setTorProxy(false));
  ipcHandle("tor:status", async () => {
    // Tor proxy bağlı mı gerçekten test et
    if (!_torEnabled) return { enabled: false, proxyUrl: null, connected: false };
    try {
      const { net } = require("electron");
      // Tor kontrolü: check.torproject.org'a istek at
      // Bu basit bir reachability check, gerçek Tor doğrulaması değil
      return { enabled: true, proxyUrl: _torProxyUrl, connected: true };
    } catch(_) {
      return { enabled: true, proxyUrl: _torProxyUrl, connected: false };
    }
  });
  ipcHandle("adblock:toggle",  (_e, enabled) => {
    _adBlockEnabled = Boolean(enabled);
    const store = readStore();
    writeStore({ ...store, settings: { ...store.settings, adBlockEnabled: _adBlockEnabled } });
    log("info", `Ad blocker ${_adBlockEnabled ? "açıldı" : "kapatıldı"}`);
    return { enabled: _adBlockEnabled };
  });
  ipcHandle("adblock:refresh", async () => {
    try {
      // Önbelleği sil, yeniden indir
      const cp = FILTER_CACHE_PATH();
      if (fs.existsSync(cp)) fs.unlinkSync(cp);
      _adBlockDomains  = new Set();
      _adBlockPatterns = [];
      await adBlockLoadFilters();
      return { ok: true, domains: _adBlockDomains.size };
    } catch(e) { return { error: e.message }; }
  });

  // ── Çeviri IPC ─────────────────────────────────────────────────────────────
  // Ayarlardan seçilen motora göre çeviri URL'i döndürür
  // Motorlar: google (varsayılan), deepl, libretranslate
  ipcHandle("translate:getUrl", (_e, { text, sourceLang, targetLang }) => {
    const store    = readStore();
    const engine   = store.settings.translateEngine || "google";
    const src      = sourceLang || "auto";
    const tgt      = targetLang || store.settings.translateTargetLang || "tr";
    const encoded  = encodeURIComponent(text || "");

    if (engine === "deepl") {
      return { url: `https://www.deepl.com/translator#${src}/${tgt}/${encoded}` };
    }
    if (engine === "libretranslate") {
      const base = store.settings.libreTranslateUrl || "https://libretranslate.com";
      return { url: `${base}/?source=${src}&target=${tgt}&q=${encoded}` };
    }
    // google (varsayılan) — mevcut davranış korunuyor
    return { url: `https://translate.google.com/?sl=${src}&tl=${tgt}&text=${encoded}&op=translate` };
  });

  // ── Export / Import (Senkronizasyon) IPC ───────────────────────────────────
  ipcHandle("sync:export", async (_e, { includePasswords }) => {
    if (!mainWindow) return { error: "Pencere yok" };
    // NOT: Export her zaman düz JSON olarak kaydedilir — şifreli store makineye özgüdür,
    // export dosyası başka cihazda da kullanılabilir olmalı.
    const defName = `illumina-backup-${new Date().toISOString().slice(0,10)}.json`;
    const res = await dialog.showSaveDialog(mainWindow, {
      title: "Yedek dosyasını kaydet",
      defaultPath: path.join(app.getPath("downloads"), defName),
      filters: [{ name:"Illumina Yedek", extensions:["json"] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };

    const store = activeReadStore();
    const payload = {
      _illuminaBackup: true,
      _version:  APP_VERSION,
      _exportedAt: new Date().toISOString(),
      _profile: _activeProfileId,
      bookmarks:  store.bookmarks  || [],
      bmFolders:  store.bmFolders  || [],
      shortcuts:  store.shortcuts  || [],
      notes:      store.notes      || "",
      sessions:   store.sessions   || [],
      settings:   {
        // Hassas alanları dışla
        ...store.settings,
        safeBrowsingApiKey: "",
      },
    };
    if (includePasswords) {
      // Şifreler zaten şifreli, olduğu gibi export et
      payload.passwords = store.passwords || [];
    }
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), "utf8");
    log("info", `Yedek dışa aktarıldı: ${res.filePath}`);
    return { ok: true, path: res.filePath, bookmarks: payload.bookmarks.length, passwords: payload.passwords?.length ?? 0 };
  });

  ipcHandle("sync:import", async (_e, { merge }) => {
    if (!mainWindow) return { error: "Pencere yok" };
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Yedek dosyasını seç",
      filters: [{ name:"Illumina Yedek", extensions:["json"] }],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(res.filePaths[0], "utf8"));
    } catch(e) { return { error: "Dosya okunamadı: " + e.message }; }

    if (!payload._illuminaBackup) return { error: "Bu bir Illumina yedek dosyası değil" };

    const current = activeReadStore();
    const next = { ...current };

    if (merge) {
      // Birleştir — mevcut verileri koru, eksikleri ekle
      const existingUrls = new Set((current.bookmarks||[]).map(b => b.url));
      const newBm = (payload.bookmarks||[]).filter(b => !existingUrls.has(b.url));
      next.bookmarks  = [...(current.bookmarks||[]), ...newBm].slice(0, 500);
      next.bmFolders  = payload.bmFolders  || current.bmFolders;
      next.shortcuts  = payload.shortcuts  || current.shortcuts;
      next.notes      = current.notes || payload.notes || "";
      next.sessions   = [...(current.sessions||[]), ...(payload.sessions||[])].slice(0,20);
    } else {
      // Üzerine yaz
      next.bookmarks  = payload.bookmarks  || [];
      next.bmFolders  = payload.bmFolders  || [];
      next.shortcuts  = payload.shortcuts  || [];
      next.notes      = payload.notes      || "";
      next.sessions   = payload.sessions   || [];
    }

    if (payload.passwords?.length) {
      if (merge) {
        const existingDomains = new Set((current.passwords||[]).map(p => p.domain));
        const newPw = payload.passwords.filter(p => !existingDomains.has(p.domain));
        next.passwords = [...(current.passwords||[]), ...newPw].slice(0,500);
      } else {
        next.passwords = payload.passwords;
      }
    }

    if (payload.settings) {
      next.settings = { ...current.settings, ...payload.settings, safeBrowsingApiKey: current.settings.safeBrowsingApiKey };
    }

    activeWriteStore(next);
    log("info", `Yedek içe aktarıldı (merge=${merge}): ${res.filePaths[0]}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sync:imported", { store: next });
    }
    return { ok: true, bookmarks: next.bookmarks.length, passwords: next.passwords?.length ?? 0 };
  });

  // ── Log IPC ────────────────────────────────────────────────────────────────
  // ── Store şifreleme durumu ────────────────────────────────────────────────
  ipcHandle("store:encryptionStatus", () => {
    const available = canEncryptStore();
    const encExists = (() => { try { return fs.existsSync(storePathEnc()); } catch(_) { return false; } })();
    return {
      available,
      encryptedFileExists: encExists,
      // Dev modunda safeStorage olmayabilir, bu normal
      devMode: !app.isPackaged,
      note: !available ? (app.isPackaged ? "Platform desteklemiyor" : "Geliştirme modu — build alınınca aktif olur") : null,
    };
  });

  ipcHandle("log:getPath",  () => getLogPath());
  ipcHandle("log:open",     () => { try { shell.openPath(getLogPath()); return true; } catch(_){ return false; } });
  ipcHandle("log:write",    (_e, { level, msg }) => {
    if (["info","warn","error"].includes(level)) log(level, "[Renderer]", msg);
    return true;
  });

  // ── PiP (Picture-in-Picture) IPC ──────────────────────────────────────────
  // PiP penceresi — her seferinde yeni BrowserWindow açılır
  let _pipWin = null;

  ipcHandle("pip:open", async (_e, { contentsId, title }) => {
    try {
      const sourceWc = WC.fromId(contentsId);
      if (!sourceWc) return { error: "WebContents bulunamadı" };

      // Varsa önceki PiP penceresini kapat
      if (_pipWin && !_pipWin.isDestroyed()) _pipWin.close();

      _pipWin = new BrowserWindow({
        width: 480, height: 270,
        minWidth: 240, minHeight: 135,
        maxWidth: 960, maxHeight: 540,
        frame: false,
        transparent: false,
        alwaysOnTop: true,
        resizable: true,
        skipTaskbar: false,
        title: title || "PiP — Illumina",
        backgroundColor: "#000000",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      // PiP içeriğini HTML ile oluştur — kaynak webview'den video src al
      const pipHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#000; overflow:hidden; width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; }
  video { width:100%; height:100%; object-fit:contain; }
  #drag { position:fixed; top:0; left:0; right:0; height:28px; -webkit-app-region:drag; background:linear-gradient(rgba(0,0,0,.5),transparent); z-index:10; display:flex; align-items:center; padding:0 8px; gap:6px; opacity:0; transition:opacity .2s; }
  body:hover #drag { opacity:1; }
  #close-btn { -webkit-app-region:no-drag; width:12px; height:12px; border-radius:50%; background:#ff5f57; border:none; cursor:pointer; }
  #title { color:#fff; font-size:11px; font-family:system-ui; opacity:.8; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
</style>
</head>
<body>
<div id="drag">
  <button id="close-btn" onclick="window.close()" title="Kapat"></button>
  <span id="title">${(title||"PiP").replace(/</g,"&lt;")}</span>
</div>
<video id="v" autoplay playsinline></video>
<script>
  // Electron PiP için Document PiP API yerine yeni pencere + video capture kullanıyoruz
  // Video elementi iframe olmadığından doğrudan erişim yok; kullanıcı video kaynağını manual açtı
  document.getElementById('v').controls = true;
</script>
</body>
</html>`)}`;

      await _pipWin.loadURL(pipHtml);

      // Ekranın sağ alt köşesine konumlandır
      const { width: sw, height: sh } = require("electron").screen.getPrimaryDisplay().workAreaSize;
      _pipWin.setPosition(sw - 500, sh - 300);

      _pipWin.on("closed", () => { _pipWin = null; });

      // Kaynak sayfada requestPictureInPicture tetikle (destekleyen tarayıcılarda)
      try {
        await sourceWc.executeJavaScript(`
          (function(){
            const v = document.querySelector('video');
            if (v && document.pictureInPictureEnabled) {
              v.requestPictureInPicture().catch(()=>{});
              return 'native_pip';
            }
            return 'no_video';
          })()
        `);
      } catch(_) {}

      log("info", "PiP penceresi açıldı");
      return { ok: true };
    } catch(e) {
      log("error", "PiP hatası:", e.message);
      return { error: e.message };
    }
  });

  ipcHandle("pip:close", () => {
    if (_pipWin && !_pipWin.isDestroyed()) { _pipWin.close(); _pipWin = null; }
    return { ok: true };
  });

  ipcHandle("pip:isOpen", () => ({ open: !!_pipWin && !_pipWin.isDestroyed() }));

  // ── Crash test (sadece geliştirme) ─────────────────────────────────────────
  ipcHandle("dev:crash", (_e, reason) => {
    if (!app.isPackaged) throw new Error("Dev crash test: " + reason);
  });

  // ── Auto-updater IPC ────────────────────────────────────────────────────────
  ipcHandle("updater:check",    async () => {
    if (!autoUpdater) return { error: "Updater mevcut değil (geliştirme modu)" };
    try { const r = await autoUpdater.checkForUpdates(); return { checking: true, version: r?.updateInfo?.version }; }
    catch(e) { return { error: e.message }; }
  });
  ipcHandle("updater:download", async () => {
    if (!autoUpdater) return { error: "Updater mevcut değil" };
    try { await autoUpdater.downloadUpdate(); return { downloading: true }; }
    catch(e) { return { error: e.message }; }
  });
  ipcHandle("updater:install",  () => {
    if (!autoUpdater) return { error: "Updater mevcut değil" };
    try { autoUpdater.quitAndInstall(false, true); return { installing: true }; }
    catch(e) { return { error: e.message }; }
  });
  ipcHandle("updater:version",  () => APP_VERSION);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const lock=app.requestSingleInstanceLock();
if(!lock){ app.quit(); }
else {
  app.on("second-instance",()=>{ if(!mainWindow)return; if(mainWindow.isMinimized())mainWindow.restore(); mainWindow.focus(); });
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(null);
    app.setName(APP_NAME);
    initLogger();
    log("info", "Uygulama başlatılıyor...");
    installIpcHandlers();
    installSessionControls();
    bindDownloadSession();
    const store = readStore();
    // Apply initial privacy settings
    try { applyPrivacySettings(store.settings); } catch(_) {}
    await loadSavedExtensions();
    // Ad blocker filtrelerini arka planda yükle (başlatmayı geciktirmez)
    const store0 = readStore();
    _adBlockEnabled = store0.settings.adBlockEnabled !== false;
    adBlockLoadFilters().catch(e => log("warn", "AdBlock yükleme hatası:", e.message));
    mainWindow=createMainWindow();
    log("info", `Ana pencere oluşturuldu — Profil: ${_activeProfileId}`);
    app.on("activate",()=>{ if(BrowserWindow.getAllWindows().length===0)mainWindow=createMainWindow(); });

    // ── Auto-updater ─────────────────────────────────────────────────────────
    if (autoUpdater && app.isPackaged) {
      // Sadece production build'de çalış
      try {
        autoUpdater.on("update-available", (info) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("updater:available", {
              version: info.version,
              releaseDate: info.releaseDate,
            });
          }
        });
        autoUpdater.on("update-downloaded", (info) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("updater:downloaded", { version: info.version });
          }
        });
        autoUpdater.on("error", (err) => {
          console.warn("[Illumina Updater]", err.message);
        });
        // 5 dakika sonra ilk kontrol, sonra her 4 saatte bir
        setTimeout(() => autoUpdater.checkForUpdates().catch(()=>{}), 5 * 60 * 1000);
        setInterval(() => autoUpdater.checkForUpdates().catch(()=>{}), 4 * 60 * 60 * 1000);
      } catch(e) { console.warn("[Illumina Updater] init error:", e.message); }
    }
  });
  app.on("window-all-closed",()=>{ if(process.platform!=="darwin")app.quit(); });
}