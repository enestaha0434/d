"use strict";
// ══════════════════════════════════════════════════════════════════════════════
// preload.js — Sandbox uyumlu (sandbox: true)
// require() KULLANILMAZ — sadece contextBridge + ipcRenderer
// Tüm config/path verileri main process'ten IPC ile alınır
// ══════════════════════════════════════════════════════════════════════════════
const { contextBridge, ipcRenderer } = require("electron");

// ── Tek izin verilen require: electron modülü ─────────────────────────────────
// path, url, ./config gibi Node modülleri sandbox'ta çalışmaz.
// Bunların sağladığı veriler main.js'de hazırlanıp IPC üzerinden gelir.

// ── İç sayfa iletişim katmanı ─────────────────────────────────────────────────
const pageSubscribers = new Set();

ipcRenderer.on("internal-state", (_event, state) => {
  for (const cb of pageSubscribers) {
    try { cb(state); } catch(_) {}
  }
});

// ── Event forwarder yardımcısı ────────────────────────────────────────────────
function makeEventListener(channel) {
  return handler => {
    const fn = (_e, ...args) => handler(...args);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// window.illumina — Ana tarayıcı API'si (renderer.js kullanır)
// ══════════════════════════════════════════════════════════════════════════════
contextBridge.exposeInMainWorld("illumina", {
  // ── Meta (main process'ten gelir, IPC üzerinden) ──────────────────────────
  // Senkron değerler için ipcRenderer.sendSync kullanmak yerine
  // bootstrap sırasında loadMeta() ile asenkron çekiyoruz
  loadMeta: () => ipcRenderer.invoke("meta:load"),

  // ── Store ─────────────────────────────────────────────────────────────────
  loadStore:  ()  => ipcRenderer.invoke("store:load"),
  saveStore:  s   => ipcRenderer.invoke("store:save", s),

  // ── Extensions ────────────────────────────────────────────────────────────
  addExtension:    ()  => ipcRenderer.invoke("extensions:add"),
  removeExtension: p   => ipcRenderer.invoke("extensions:remove", p),
  listExtensions:  ()  => ipcRenderer.invoke("extensions:list"),

  // ── Downloads ─────────────────────────────────────────────────────────────
  openDownload:         id  => ipcRenderer.invoke("downloads:open", id),
  showDownloadInFolder: id  => ipcRenderer.invoke("downloads:showInFolder", id),

  // ── Find in page ──────────────────────────────────────────────────────────
  findInPageStart: (cid, text)          => ipcRenderer.invoke("findInPage:start", { contentsId: cid, text }),
  findInPageNext:  (cid, text, forward) => ipcRenderer.invoke("findInPage:next",  { contentsId: cid, text, forward }),
  findInPageStop:  cid                  => ipcRenderer.invoke("findInPage:stop",  { contentsId: cid }),

  // ── Audio / DevTools ──────────────────────────────────────────────────────
  audioMute:    (cid, mute) => ipcRenderer.invoke("audio:mute",     { contentsId: cid, mute }),
  openDevTools: cid         => ipcRenderer.invoke("devtools:open",  { contentsId: cid }),

  // ── Weather / News ────────────────────────────────────────────────────────
  weatherFetch:  (lat, lon) => ipcRenderer.invoke("weather:fetch", { lat, lon }),
  weatherGeoip:  ()         => ipcRenderer.invoke("weather:geoip"),
  newsFetchAll:  ()         => ipcRenderer.invoke("news:fetch-all"),
  newsFetch:     sourceId   => ipcRenderer.invoke("news:fetch", sourceId),
  newsSources:   ()         => ipcRenderer.invoke("news:sources"),

  // ── Safety ────────────────────────────────────────────────────────────────
  safetyCheck:         url   => ipcRenderer.invoke("safety:check", url),
  safetySaveSettings:  patch => ipcRenderer.invoke("safety:settings:save", patch),

  // ── Passwords ─────────────────────────────────────────────────────────────
  listPasswords:   ()      => ipcRenderer.invoke("passwords:list"),
  getPassword:     id      => ipcRenderer.invoke("passwords:get",    id),
  savePassword:    entry   => ipcRenderer.invoke("passwords:save",   entry),
  deletePassword:  id      => ipcRenderer.invoke("passwords:delete", id),
  findPasswords:   domain  => ipcRenderer.invoke("passwords:find",   domain),

  // ── Bookmark folders ──────────────────────────────────────────────────────
  listBmFolders:  ()       => ipcRenderer.invoke("bmfolders:list"),
  saveBmFolders:  folders  => ipcRenderer.invoke("bmfolders:save", folders),

  // ── Sessions ──────────────────────────────────────────────────────────────
  saveSession:    (name, tabs) => ipcRenderer.invoke("session:save",   { name, tabs }),
  listSessions:   ()           => ipcRenderer.invoke("session:list"),
  deleteSession:  id           => ipcRenderer.invoke("session:delete", id),

  // ── Clipboard ─────────────────────────────────────────────────────────────
  addClipboard:   text => ipcRenderer.invoke("clipboard:add",  text),
  listClipboard:  ()   => ipcRenderer.invoke("clipboard:list"),
  clearClipboard: ()   => ipcRenderer.invoke("clipboard:clear"),

  // ── Cookies ───────────────────────────────────────────────────────────────
  getCookies:            ()  => ipcRenderer.invoke("cookies:getAll"),
  clearCookies:          ()  => ipcRenderer.invoke("cookies:clearAll"),
  clearCookiesByDomain:  d   => ipcRenderer.invoke("cookies:clearByDomain", d),

  // ── Sticky notes ──────────────────────────────────────────────────────────
  getStickyNotes:   host         => ipcRenderer.invoke("stickynotes:get",  host),
  saveStickyNotes:  (host, notes)=> ipcRenderer.invoke("stickynotes:save", { host, notes }),

  // ── Notifications ─────────────────────────────────────────────────────────
  listNotifications:   () => ipcRenderer.invoke("notifications:list"),
  clearNotifications:  () => ipcRenderer.invoke("notifications:clear"),

  // ── Screenshot / Zoom ─────────────────────────────────────────────────────
  captureScreenshot: cid       => ipcRenderer.invoke("screenshot:capture", { contentsId: cid, saveToFile: true }),
  capturePreview:    cid       => ipcRenderer.invoke("screenshot:capture", { contentsId: cid, saveToFile: false }),
  setZoom:           (cid,lvl) => ipcRenderer.invoke("zoom:set",           { contentsId: cid, level: lvl }),
  getZoom:           cid       => ipcRenderer.invoke("zoom:get",           { contentsId: cid }),

  // ── Auto-updater ──────────────────────────────────────────────────────────
  updaterCheck:    () => ipcRenderer.invoke("updater:check"),
  updaterDownload: () => ipcRenderer.invoke("updater:download"),
  updaterInstall:  () => ipcRenderer.invoke("updater:install"),
  updaterVersion:  () => ipcRenderer.invoke("updater:version"),

  // ── Profiles ──────────────────────────────────────────────────────────────
  profilesList:       ()       => ipcRenderer.invoke("profiles:list"),
  profilesActive:     ()       => ipcRenderer.invoke("profiles:active"),
  profilesCreate:     opts     => ipcRenderer.invoke("profiles:create",      opts),
  profilesRename:     opts     => ipcRenderer.invoke("profiles:rename",      opts),
  profilesDelete:     opts     => ipcRenderer.invoke("profiles:delete",      opts),
  profilesSwitch:     opts     => ipcRenderer.invoke("profiles:switch",      opts),
  profilesStoreLoad:  ()       => ipcRenderer.invoke("profiles:store:load"),
  profilesStoreSave:  s        => ipcRenderer.invoke("profiles:store:save",  s),

  // ── Sync ──────────────────────────────────────────────────────────────────
  syncExport: opts => ipcRenderer.invoke("sync:export", opts),
  syncImport: opts => ipcRenderer.invoke("sync:import", opts),

  // ── PiP ───────────────────────────────────────────────────────────────────
  pipOpen:   opts => ipcRenderer.invoke("pip:open",   opts),
  pipClose:  ()   => ipcRenderer.invoke("pip:close"),
  pipIsOpen: ()   => ipcRenderer.invoke("pip:isOpen"),

  // ── Background photo ──────────────────────────────────────────────────────
  bgPhotoSave:  dataUrl => ipcRenderer.invoke("bgPhoto:save",  dataUrl),
  bgPhotoGet:   ()      => ipcRenderer.invoke("bgPhoto:get"),
  bgPhotoClear: ()      => ipcRenderer.invoke("bgPhoto:clear"),

  // ── Ad Blocker ────────────────────────────────────────────────────────────
  adBlockStatus:  ()      => ipcRenderer.invoke("adblock:status"),
  adBlockToggle:  enabled => ipcRenderer.invoke("adblock:toggle",  enabled),
  adBlockRefresh: ()      => ipcRenderer.invoke("adblock:refresh"),

  // ── Translation ───────────────────────────────────────────────────────────
  translateGetUrl: opts => ipcRenderer.invoke("translate:getUrl", opts),

  // ── Tor ───────────────────────────────────────────────────────────────────
  torEnable:  opts => ipcRenderer.invoke("tor:enable",  opts || {}),
  torDisable: ()   => ipcRenderer.invoke("tor:disable"),
  torStatus:  ()   => ipcRenderer.invoke("tor:status"),

  // ── Log ───────────────────────────────────────────────────────────────────
  storeEncryptionStatus: () => ipcRenderer.invoke("store:encryptionStatus"),
  logGetPath: ()            => ipcRenderer.invoke("log:getPath"),
  logOpen:    ()            => ipcRenderer.invoke("log:open"),
  logWrite:   (level, msg)  => ipcRenderer.invoke("log:write", { level, msg }),

  // ── Event listeners ───────────────────────────────────────────────────────
  onDownloadsUpdated:  makeEventListener("downloads:updated"),
  onCtxOpenUrl:        makeEventListener("ctx:open-url"),
  onCtxSearchSelection:makeEventListener("ctx:search-selection"),
  onCtxFindInPage:     makeEventListener("ctx:find-in-page"),
  onCtxScreenshot:     makeEventListener("ctx:screenshot"),
  onCtxAddResearch:    makeEventListener("ctx:add-research"),
  onNotification:      makeEventListener("notification:new"),
  onTrayAction:        makeEventListener("tray:action"),
  onUpdaterAvailable:  makeEventListener("updater:available"),
  onUpdaterDownloaded: makeEventListener("updater:downloaded"),
  onSafetyBlocked:     makeEventListener("safety:blocked"),
  onProfileSwitched:   makeEventListener("profile:switched"),
  onSyncImported:      makeEventListener("sync:imported"),

  // ── Internal page state ───────────────────────────────────────────────────
  _internalSubscribers: pageSubscribers, // internal use only
});

