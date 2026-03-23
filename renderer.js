"use strict";
const B = window.illumina;
// M = meta veriler (bootstrap'ta B.loadMeta() ile doldurulur)
// contextBridge dondurulmuş olduğu için meta B'ye assign edilemez
const _metaDefaults = {
  appName: "Illumina Browser",
  themes: [], searchEngines: [], securityModes: [], startPageModes: [],
  fontSizes: [], languages: [], translateEngines: [], uiFonts: [],
  grainLevels: [], tabLayouts: [], defaultSettings: {}, defaultShortcuts: [],
  pages: { welcome:"", settings:"", history:"", downloads:"", pdf:"", about:"" },
  webviewPreload: "", partition: "", incognitoPartition: "",
};
const M = () => window._illuminaMeta || _metaDefaults;

const PAGE_LABELS = { welcome:"Karşılama", settings:"Ayarlar", history:"Geçmiş", downloads:"İndirmeler" };
// SEC_LABELS ve SEC_COLORS bootstrap'ta B.meta yüklendikten sonra doldurulur
let SEC_LABELS  = { standard:"Standard", balanced:"Dengeli", strict:"Sıkı" };
const SEC_COLORS  = { standard:"#b06a3a", balanced:"#4a7fc1", strict:"#c04040" };

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  settings:           {},
  bookmarks:          [], history:[], downloads:[], shortcuts:[],
  tabs:[], activeTabId:null,
  tabGroups: [],
  closedTabHistory:[], notes:"",
  extensionNotice:"", extensionNoticeTone:"muted",
  safetyCache:     new Map(),
  tabSafetyResults:new Map(),
  tabScreenshots:  new Map(), // tabId → dataUrl (önbellek)
};

// ── UI ────────────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelector(sel);
const ui = {
  body:          document.body,
  brandBtn:      $("brand-button"),
  tabsBar:       $("tabs-bar"),
  webviewStack:  $("webview-stack"),
  addrForm:      $("address-form"),
  addrInput:     $("address-input"),
  backBtn:       $("back-button"),
  fwdBtn:        $("forward-button"),
  reloadBtn:     $("reload-button"),
  bmBtn:         $("bookmark-button"),
  newTabBtn:     $("new-tab-button"),
  bmStrip:       $("bookmark-strip"),
  secPill:       $("security-pill"),
  secDot:        $$(".security-dot"),
  findBar:       $("find-bar"),
  findInput:     $("find-input"),
  findCount:     $("find-count"),
  findPrev:      $("find-prev"),
  findNext:      $("find-next"),
  findClose:     $("find-close"),
  notesPanel:    $("notes-panel"),
  notesTa:       $("notes-textarea"),
  notesClose:    $("notes-close"),
  notesClear:    $("notes-clear"),
  notesToggle:   $("notes-toggle"),
  readerBtn:     $("reader-btn"),
  focusBar:      $("focus-bar"),
  focusBtn:      $("focus-btn"),
  focusExit:     $("focus-exit"),
  incognitoBtn:  $("incognito-btn"),
  devtoolsBtn:   $("devtools-btn"),
  histPopupBtn:  $("hist-popup-btn"),
  pageButtons:   Array.from(document.querySelectorAll("[data-page]")),
  chromeShell:   $$(".chrome-shell"),
  siteInfoBtn:   $("site-info-btn"),
  siteInfoPopup: $("site-info-popup"),
  siteInfoIcon:  $("site-info-icon"),
};

let persistT=null, reloadIsStop=false, findTabId=null, notesSaveT=null;
let dlPopupOpen=false, siteInfoOpen=false, histPopupOpen=false;
let focusMode=false, readerMode=false;
const sleepTimers = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid        = p=>`${p||"i"}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const trunc      = (v,n=34)=>!v?"":v.length>n?v.slice(0,n-1)+"…":v;
const esc        = v=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const faviconUrl = url=>{ try{return`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).origin)}&sz=32`;}catch{return"";} };
const getEngine  = ()=>M().searchEngines.find(e=>e.id===S.settings.searchEngine)||M().searchEngines[0]||{id:'google',label:'Google',template:'https://www.google.com/search?q=%s',home:'https://www.google.com'};
const looksUrl   = v=>/^(localhost|(\d{1,3}\.){3}\d{1,3}|[\w-]+\.[\w.-]+)(:\d+)?(\/.*)?$/i.test(v);
const httpsify   = url=>S.settings.httpsOnly&&url.startsWith("http://")?("https://"+url.slice(7)):url;

function normalizeInput(raw) {
  const v = String(raw||"").trim();
  if (!v) return newTabUrl();
  if (/^https?:\/\//i.test(v) || v.startsWith("file:///")) return httpsify(v);
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(v)) return httpsify(v);
  if (!/\s/.test(v) && looksUrl(v)) return httpsify("https://"+v);
  // it's a search query
  return getEngine().template.replace("%s", encodeURIComponent(v));
}
function newTabUrl() {
  return (S.settings.startPageMode||"welcome")==="search-engine"
    ?(getEngine().home||"https://www.google.com"):M().pages.welcome;
}
function getActiveTab() { return S.tabs.find(t=>t.id===S.activeTabId)||null; }
function isBookmarked(url) { return S.bookmarks.some(b=>b.url===url); }
function applyTheme() {
  ui.body.dataset.theme = S.settings.theme || "mist";
  // Grain
  ui.body.dataset.grain = S.settings.grainLevel || "";
  // UI font
  ui.body.dataset.uiFont = S.settings.uiFont || "";
  // Arkaplan foto
  if (S.settings.bgPhotoPath && S.settings.bgPhotoPath.startsWith("data:image/")) {
    ui.body.style.setProperty("--bg-image", `url("${S.settings.bgPhotoPath}")`);
    ui.body.dataset.bgPhoto = "true";
  } else {
    ui.body.style.removeProperty("--bg-image");
    delete ui.body.dataset.bgPhoto;
  }
  // Tab layout
  const layout = S.settings.tabLayout || "horizontal";
  const shell = document.querySelector(".browser-shell");
  if (shell) {
    shell.classList.toggle("layout-vertical",   layout === "vertical");
    shell.classList.toggle("layout-horizontal", layout !== "vertical");
  }
}
function applyFontSize() {
  const size = S.settings.fontSize || "medium";
  document.documentElement.dataset.fontsize = size;
  document.body.dataset.fontsize = size;
}
function applyBookmarkStrip() { if(ui.bmStrip) ui.bmStrip.style.display=S.settings.showBookmarkStrip===false?"none":""; }
function applyCustomCss() {
  let el = document.getElementById("_ill_css");
  if (!el) { el = document.createElement("style"); el.id = "_ill_css"; document.head.appendChild(el); }
  el.textContent = S.settings.customCss || "";
}
function applyUiFont() {
  const font = S.settings.uiFont || "";
  let el = document.getElementById("_font_ovr");
  if (!el) { el=document.createElement("style"); el.id="_font_ovr"; document.head.appendChild(el); }
  el.textContent = font ? `*{font-family:${font}!important;}` : "";
}
function applyLanguage() {
  const lang = S.settings.language || "tr";
  const maps = {
    tr: { addr:"Ara ya da adres gir",             newTab:"Yeni sekme (Ctrl+T)",        inc:"Gizli sekme (Ctrl+Shift+N)",     notes:"Notlar (Ctrl+N)",   bm:"Yer imi (Ctrl+D)" },
    en: { addr:"Search or enter URL",              newTab:"New tab (Ctrl+T)",            inc:"Private tab (Ctrl+Shift+N)",     notes:"Notes (Ctrl+N)",    bm:"Bookmark (Ctrl+D)" },
    de: { addr:"Suchen oder URL eingeben",          newTab:"Neuer Tab (Ctrl+T)",          inc:"Privater Tab (Ctrl+Shift+N)",    notes:"Notizen (Ctrl+N)",  bm:"Lesezeichen (Ctrl+D)" },
    fr: { addr:"Rechercher ou entrer une URL",      newTab:"Nouvel onglet (Ctrl+T)",      inc:"Onglet privé (Ctrl+Shift+N)",   notes:"Notes (Ctrl+N)",    bm:"Signet (Ctrl+D)" },
    es: { addr:"Buscar o escribir URL",             newTab:"Nueva pestaña (Ctrl+T)",      inc:"Pestaña privada (Ctrl+Shift+N)",notes:"Notas (Ctrl+N)",    bm:"Marcador (Ctrl+D)" },
    ar: { addr:"ابحث أو أدخل عنوان URL",           newTab:"تبويب جديد (Ctrl+T)",         inc:"تبويب خاص (Ctrl+Shift+N)",      notes:"ملاحظات (Ctrl+N)", bm:"إشارة مرجعية (Ctrl+D)" },
    ja: { addr:"検索またはURLを入力",               newTab:"新しいタブ (Ctrl+T)",          inc:"プライベートタブ (Ctrl+Shift+N)",notes:"メモ (Ctrl+N)",     bm:"ブックマーク (Ctrl+D)" },
    zh: { addr:"搜索或输入网址",                    newTab:"新标签页 (Ctrl+T)",            inc:"隐私标签页 (Ctrl+Shift+N)",      notes:"笔记 (Ctrl+N)",     bm:"书签 (Ctrl+D)" },
  };
  const m = maps[lang] || maps.tr;
  if (ui.addrInput) ui.addrInput.placeholder = m.addr;
  if (ui.newTabBtn) ui.newTabBtn.title = m.newTab;
  if (ui.incognitoBtn) ui.incognitoBtn.title = m.inc;
  if (ui.notesToggle) ui.notesToggle.title = m.notes;
  if (ui.bmBtn) ui.bmBtn.title = m.bm;
  document.documentElement.lang = lang;
  const rtl = ["ar", "he", "fa", "ur"];
  document.documentElement.dir = rtl.includes(lang) ? "rtl" : "ltr";
}
function showToast(msg, duration=3000, type="default") {
  // Stack toasts
  const existing = document.querySelectorAll("._ill_toast");
  existing.forEach((t,i) => {
    t.style.transform = `translateX(-50%) translateY(${-((existing.length-i)*44)}px)`;
    t.style.opacity = String(1 - (existing.length-i)*0.25);
  });
  const el = document.createElement("div");
  el.className = "_ill_toast";
  const colors = { default:"rgba(16,16,18,.95)", success:"rgba(22,80,44,.95)", error:"rgba(120,28,28,.95)", info:"rgba(20,50,100,.95)" };
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(16px) scale(.9);background:${colors[type]||colors.default};color:#fff;padding:10px 20px;border-radius:12px;font-size:12.5px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity 180ms cubic-bezier(.22,.68,0,1.2),transform 220ms cubic-bezier(.34,1.56,.64,1);white-space:nowrap;max-width:85vw;box-shadow:0 6px 24px rgba(0,0,0,.28);backdrop-filter:blur(8px);letter-spacing:.01em`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateX(-50%) translateY(0) scale(1)";
    });
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(8px) scale(.95)";
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ── Security dot ──────────────────────────────────────────────────────────────
function updateSecDot() {
  const m=S.settings.securityMode||"standard";
  if(ui.secPill) ui.secPill.textContent=SEC_LABELS[m]||"Standard";
  if(ui.secDot)  ui.secDot.style.background=SEC_COLORS[m]||SEC_COLORS.standard;
}

// ── Factories ─────────────────────────────────────────────────────────────────
function makeInternal(page,ov={}) {
  return {id:ov.id||uid("tab"),type:"internal",page,title:ov.title||PAGE_LABELS[page]||"Sayfa",
    url:M().pages[page],favicon:"",loading:false,internalReady:false,webview:null,
    muted:false,audible:false,pinned:false,incognito:false,sleeping:false};
}
function makeWeb(url,ov={}) {
  return {id:ov.id||uid("tab"),type:"web",page:null,title:ov.title||"Yeni Sekme",
    url,favicon:"",loading:false,internalReady:false,webview:null,
    muted:false,audible:false,pinned:ov.pinned||false,incognito:ov.incognito||false,sleeping:false,containerId:ov.containerId||null};
}

// ── Persistence ───────────────────────────────────────────────────────────────
function persist() {
  B.saveStore({
    settings:S.settings, tabGroups:S.tabGroups||[], bookmarks:S.bookmarks, history:S.history,
    downloads:S.downloads, shortcuts:S.shortcuts, notes:S.notes,
    session:{
      tabs:S.tabs.filter(t=>!t.incognito).map(t=>({id:t.id,type:t.type,page:t.page,title:t.title,url:t.url,pinned:t.pinned})),
      activeTabId:S.activeTabId,
    },
  });
}
function persistSoon() { clearTimeout(persistT); persistT=setTimeout(persist,200); }

// ── Internal state broadcast ──────────────────────────────────────────────────
function getInternalState() {
  const sc=(S.shortcuts.length?S.shortcuts:M().defaultShortcuts).slice(0,12);
  return {
    appName:M().appName, theme:S.settings.theme, settings:S.settings, shortcuts:sc,
    bookmarks:S.bookmarks.slice(0,12), history:S.history.slice(0,20), downloads:S.downloads.slice(0,20),
    meta:{
      themes:M().themes, searchEngines:M().searchEngines, securityModes:M().securityModes,
      startPageModes:M().startPageModes, fontSizes:M().fontSizes, languages:M().languages||[],
      tabCount:S.tabs.length, bookmarkCount:S.bookmarks.length,
      extensions:S.settings.extensions||[],
      extensionNotice:S.extensionNotice, extensionNoticeTone:S.extensionNoticeTone,
    },
  };
}
const sendToInternal = tab=>{ if(tab?.webview&&tab.internalReady)tab.webview.send("internal-state",getInternalState()); };
const syncInternals  = ()=>S.tabs.filter(t=>t.type==="internal").forEach(sendToInternal);

// ── Tab Groups ────────────────────────────────────────────────────────────────
const GROUP_COLORS = ["#e05c5c","#e0935c","#d4b84a","#5cae5c","#5c8ae0","#9b5ce0","#e05c9b","#5cc4c4"];

function createTabGroup(name, tabId) {
  const id = "g" + Date.now().toString(36);
  const color = GROUP_COLORS[S.tabGroups.length % GROUP_COLORS.length];
  S.tabGroups.push({ id, name: name||"Grup", color, tabIds: tabId?[tabId]:[], collapsed:false });
  persistSoon(); renderTabs();
  return S.tabGroups[S.tabGroups.length-1];
}

function addTabToGroup(tabId, groupId) {
  S.tabGroups.forEach(g => { g.tabIds = g.tabIds.filter(x=>x!==tabId); });
  const g = S.tabGroups.find(g=>g.id===groupId);
  if (g && !g.tabIds.includes(tabId)) g.tabIds.push(tabId);
  S.tabGroups = S.tabGroups.filter(g=>g.tabIds.length>0);
  persistSoon(); renderTabs();
}

function removeTabFromGroup(tabId) {
  S.tabGroups.forEach(g => { g.tabIds = g.tabIds.filter(x=>x!==tabId); });
  S.tabGroups = S.tabGroups.filter(g=>g.tabIds.length>0);
  persistSoon(); renderTabs();
}

function getTabGroup(tabId) {
  return S.tabGroups.find(g=>g.tabIds.includes(tabId)) || null;
}

function showGroupContextMenu(tabId, anchor) {
  document.getElementById("_tgm")?.remove();
  document.getElementById("_tgms")?.remove();
  const tab = S.tabs.find(t=>t.id===tabId);
  if (!tab) return;

  const menu = document.createElement("div");
  menu.id = "_tgm";
  menu.style.cssText = "position:fixed;z-index:2147483647;background:var(--panel);border:1px solid var(--line-mid);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);padding:6px;min-width:195px;opacity:0;transform:translateY(-4px) scale(.97);transition:opacity 120ms,transform 120ms;pointer-events:none";

  const sty = document.createElement("style");
  sty.id = "_tgms";
  sty.textContent = "._gi{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;background:0;cursor:pointer;font-size:12.5px;color:var(--text);border-radius:7px;text-align:left}._gi:hover{background:var(--accent-soft);color:var(--accent)}._gd{font-size:10px;color:var(--text-2);padding:6px 10px 2px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}._gsep{height:1px;background:var(--line-mid);margin:4px 6px}";
  document.head.appendChild(sty);

  const curGrp = getTabGroup(tabId);
  const otherGroups = S.tabGroups.filter(g=>g.id!==curGrp?.id);

  if (otherGroups.length) {
    const lbl = document.createElement("div"); lbl.className="_gd"; lbl.textContent="Gruba ekle";
    menu.appendChild(lbl);
    otherGroups.forEach(g => {
      const btn = document.createElement("button"); btn.className="_gi"; btn.type="button";
      btn.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;background:${g.color};flex-shrink:0"></span>${g.name}`;
      btn.onclick = () => { addTabToGroup(tabId, g.id); close(); };
      menu.appendChild(btn);
    });
    const sep = document.createElement("div"); sep.className="_gsep"; menu.appendChild(sep);
  }

  const newBtn = document.createElement("button"); newBtn.className="_gi"; newBtn.type="button";
  newBtn.innerHTML = '<span style="font-size:14px;width:9px;text-align:center">+</span>Yeni grup oluştur';
  newBtn.onclick = () => {
    const name = prompt("Grup adı:", "Yeni Grup");
    if (name !== null) createTabGroup(name, tabId);
    close();
  };
  menu.appendChild(newBtn);

  if (curGrp) {
    const sep2 = document.createElement("div"); sep2.className="_gsep"; menu.appendChild(sep2);
    const remBtn = document.createElement("button"); remBtn.className="_gi"; remBtn.type="button";
    remBtn.style.color="#c04030";
    remBtn.innerHTML = '<span style="font-size:11px;width:9px;text-align:center">✕</span>Gruptan çıkar';
    remBtn.onclick = () => { removeTabFromGroup(tabId); close(); };
    menu.appendChild(remBtn);
  }

  // Ayraç
  const sep3 = document.createElement("div"); sep3.className="_gsep"; menu.appendChild(sep3);

  // Sekme aksiyonları
  const pinBtn = document.createElement("button"); pinBtn.className="_gi"; pinBtn.type="button";
  pinBtn.innerHTML = `<span style="font-size:11px;width:9px;text-align:center">${tab.pinned?"📌":"📌"}</span>${tab.pinned?"Sabitlemeyi kaldır":"Sabitle"}`;
  pinBtn.onclick = ()=>{ pinTab(tabId); close(); };
  menu.appendChild(pinBtn);

  const lockBtn = document.createElement("button"); lockBtn.className="_gi"; lockBtn.type="button";
  lockBtn.innerHTML = `<span style="font-size:11px;width:9px;text-align:center">${tab.locked?"🔓":"🔒"}</span>${tab.locked?"Kilidi kaldır":"Kilitle"}`;
  lockBtn.onclick = ()=>{ lockTab(tabId); close(); };
  menu.appendChild(lockBtn);

  const dupBtn = document.createElement("button"); dupBtn.className="_gi"; dupBtn.type="button";
  dupBtn.innerHTML = '<span style="font-size:11px;width:9px;text-align:center">⿻</span>Sekmeyi çoğalt';
  dupBtn.onclick = ()=>{ if(tab.url) openWebTab(tab.url,{activate:true}); close(); };
  menu.appendChild(dupBtn);

  if (!tab.locked) {
    const sep4 = document.createElement("div"); sep4.className="_gsep"; menu.appendChild(sep4);
    const closeBtn2 = document.createElement("button"); closeBtn2.className="_gi"; closeBtn2.type="button";
    closeBtn2.style.color="#c04030";
    closeBtn2.innerHTML = '<span style="font-size:11px;width:9px;text-align:center">✕</span>Sekmeyi kapat';
    closeBtn2.onclick = ()=>{ closeTab(tabId); close(); };
    menu.appendChild(closeBtn2);
  }

  // Konumlandır — chrome-shell dışında, fixed
  const rect = anchor.getBoundingClientRect();
  menu.style.top  = (rect.bottom+4)+"px";
  menu.style.left = Math.min(rect.left, window.innerWidth-195)+"px";
  document.body.appendChild(menu);

  function close() {
    menu.style.opacity="0"; menu.style.transform="translateY(-4px) scale(.97)";
    setTimeout(()=>{menu.remove();sty.remove();},120);
  }
  requestAnimationFrame(()=>{
    menu.style.pointerEvents=""; menu.style.opacity="1"; menu.style.transform="translateY(0) scale(1)";
  });
  setTimeout(()=>{
    document.addEventListener("click", function _c(e){
      if(!menu.contains(e.target)){close();document.removeEventListener("click",_c);}
    });
  },10);
}

// ── Render tabs ───────────────────────────────────────────────────────────────
function renderTabs() {
  if (!ui.tabsBar.dataset.delegated) {
    ui.tabsBar.dataset.delegated = "true";
    ui.tabsBar.addEventListener("click", e => {
      const closeBtn = e.target.closest(".tab-close");
      if (closeBtn) { e.stopPropagation(); const row=closeBtn.closest(".tab-card"); if(row&&row.dataset.tabId)closeTab(row.dataset.tabId); return; }
      const audioBtn = e.target.closest(".tab-audio");
      if (audioBtn) { e.stopPropagation(); const row=audioBtn.closest(".tab-card"); if(row&&row.dataset.tabId)toggleMute(row.dataset.tabId); return; }
      const grpHeader = e.target.closest(".tab-group-header");
      if (grpHeader) {
        e.stopPropagation();
        const grp = S.tabGroups.find(g=>g.id===grpHeader.dataset.groupId);
        if (grp) { grp.collapsed=!grp.collapsed; persistSoon(); renderTabs(); }
        return;
      }
    });
  }

  const existingMap = new Map();
  Array.from(ui.tabsBar.children).forEach(el => {
    if (el.dataset.tabId) existingMap.set(el.dataset.tabId, el);
    if (el.dataset.groupId && el.classList.contains("tab-group-header")) existingMap.set("__grp__"+el.dataset.groupId, el);
  });

  const newOrder = [];
  const renderedTabIds = new Set();

  // Gruplu sekmeleri önce render et
  S.tabGroups.forEach(grp => {
    const grpTabs = grp.tabIds.map(id=>S.tabs.find(t=>t.id===id)).filter(Boolean);
    if (!grpTabs.length) return;
    const isCollapsed = Boolean(grp.collapsed);
    const headerKey = "__grp__"+grp.id;
    const headerHash = `grphdr|${grp.name}|${grp.color}|${isCollapsed}|${grpTabs.length}`;
    let header = existingMap.get(headerKey);
    if (!header) {
      header = document.createElement("button");
      header.type = "button";
      header.className = "tab-group-header";
      header.dataset.groupId = grp.id;
    } else { existingMap.delete(headerKey); }
    if (header.dataset.stateHash !== headerHash) {
      header.dataset.stateHash = headerHash;
      header.style.cssText = `border-left:3px solid ${grp.color};background:${grp.color}18`;
      header.innerHTML = `<span class="tgh-dot" style="background:${grp.color}"></span><span class="tgh-name">${esc(grp.name)}</span><span class="tgh-count">${grpTabs.length}</span><span class="tgh-arrow${isCollapsed?' is-collapsed':''}"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2 3.5l2.5 2.5L7 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    }
    newOrder.push(header);
    grpTabs.forEach(tab => { renderedTabIds.add(tab.id); newOrder.push(_renderTabCard(tab, existingMap, isCollapsed)); });
  });

  // Grupsuz sekmeler
  S.tabs.forEach(tab => { if (!renderedTabIds.has(tab.id)) newOrder.push(_renderTabCard(tab, existingMap, false)); });

  for (let i=0; i<newOrder.length; i++) { if (ui.tabsBar.children[i]!==newOrder[i]) ui.tabsBar.insertBefore(newOrder[i], ui.tabsBar.children[i]||null); }
  existingMap.forEach(row=>row.remove());

  const at=getActiveTab();
  ui.pageButtons.forEach(b=>b.classList.toggle("is-active",at?.type==="internal"&&at.page===b.dataset.page));
  if(ui.readerBtn){ ui.readerBtn.style.display=at?.type==="web"?"grid":"none"; ui.readerBtn.classList.toggle("is-active",readerMode); }
  if(ui.focusBtn) ui.focusBtn.classList.toggle("is-active",focusMode);
  if(ui.devtoolsBtn) ui.devtoolsBtn.style.display=at?.type==="web"?"grid":"none";
  if(ui.incognitoBtn) ui.incognitoBtn.classList.toggle("is-active",S.tabs.some(t=>t.incognito));
  const _isWeb=at?.type==="web";
  ["translate-btn","screenshot-btn","sticky-btn"].forEach(id=>{ const el=document.getElementById(id); if(el)el.style.display=_isWeb?"grid":"none"; });
}

function _renderTabCard(tab, existingMap, collapsed) {
  let favHtml="";
  if(tab.sleeping){ favHtml='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 7A5 5 0 1 1 5 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 2v3h-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  else if(tab.loading){ favHtml='<span class="tab-spinner"></span>'; }
  else if(tab.favicon){ favHtml=`<img src="${esc(tab.favicon)}" alt="">`; }
  else if(tab.type==="internal"){ favHtml='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M6 3.5v3l1.5 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'; }
  else { const fu=faviconUrl(tab.url); if(fu) favHtml=`<img src="${esc(fu)}" alt="" onerror="this.parentNode.textContent='${esc((tab.title?.[0]||'W').toUpperCase())}'">`;else favHtml=esc((tab.title?.[0]||"W").toUpperCase()); }
  if(tab.audible||tab.muted){
    const abInner=tab.muted?'<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M3.5 4.5v2l2 2 2-2V3.5l-2-2L3.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>':'<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4H3.5L5 2.5v5L3.5 6H2V4Z" stroke="currentColor" stroke-width="1.2"/><path d="M7 3.5a2 2 0 0 1 0 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    favHtml+=`<button class="tab-audio${tab.muted?' is-muted':''}" type="button" title="${tab.muted?'Sesi aç':'Sessize al'}">${abInner}</button>`;
  }
  const titleHtml=!tab.pinned?`<div class="tab-title">${esc(trunc(tab.title||"Yeni Sekme",28))}</div>`:"";
  const closeHtml=!tab.pinned?`<button class="tab-close" type="button" title="Kapat">×</button>`:`<button class="tab-close" type="button" style="display:none"></button>`;
  const _grp=getTabGroup(tab.id);
  let borderTop="";
  if(_grp) borderTop=`2px solid ${_grp.color}`;
  else if(tab.containerId){ let hash=0; for(let i=0;i<tab.containerId.length;i++)hash=tab.containerId.charCodeAt(i)+((hash<<5)-hash); borderTop=`2px solid hsl(${Math.abs(hash)%360},65%,55%)`; }
  const className="tab-card"+(tab.id===S.activeTabId?" is-active":"")+(tab.pinned?" is-pinned":"")+(tab.incognito?" is-incognito":"")+(tab.sleeping?" is-sleeping":"")+(tab.locked?" is-locked":"")+(tab.containerId?" is-container":"")+(collapsed?" is-group-collapsed":"");
  const stateHash=`${className}|${favHtml}|${titleHtml}|${borderTop}`;
  let row=existingMap.get(tab.id);
  if(!row){
    row=document.createElement("button"); row.type="button"; row.dataset.tabId=tab.id;
    row.addEventListener("click",()=>activateTab(tab.id));
    row.addEventListener("contextmenu",e=>{e.preventDefault();e.stopPropagation();showGroupContextMenu(tab.id,row);});
  } else { existingMap.delete(tab.id); }
  if(row.dataset.stateHash!==stateHash){
    row.className=className;
    row.innerHTML=`<div class="tab-favicon">${favHtml}</div><div class="tab-copy">${titleHtml}</div>${closeHtml}`;
    row.style.borderTop=borderTop;
    if(_grp)row.dataset.groupId=_grp.id; else delete row.dataset.groupId;
    row.dataset.stateHash=stateHash;
  }
  return row;
}

// ── Bookmark strip ────────────────────────────────────────────────────────────
// renderBmStrip → features.js'de tanımlı (klasör desteği ile)

// ── Reload btn ────────────────────────────────────────────────────────────────
function setReloadState(loading) {
  reloadIsStop = loading;
  ui.reloadBtn.innerHTML = loading
    ? '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12 7A5 5 0 0 1 3 11.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M2 7A5 5 0 0 1 11 2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11 1v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13v-3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  ui.reloadBtn.title = loading ? "Durdur (Esc)" : "Yenile (F5)";
}

// ── Site info button — güvenlik ikonunu doğru göster ─────────────────────────
function updateSiteInfoBtn(tab) {
  const btn  = ui.siteInfoBtn;
  const icon = ui.siteInfoIcon;
  if (!btn) return;

  if (!tab || tab.type !== "web" || !tab.url.startsWith("http")) {
    btn.style.display = "none";
    btn.dataset.secure = "";
    btn.style.color = "";
    return;
  }
  btn.style.display = "flex";

  // Check if we have a cached safety result for this tab
  const safetyResult = S.tabSafetyResults.get(tab.id);

  if (safetyResult && safetyResult.level !== "safe" && safetyResult.level !== "info") {
    // Show warning icon based on safety level
    const lvlColor = { warning:"#d97706", danger:"#e07040", blocked:"#dc2626" }[safetyResult.level] || "#e07040";
    btn.dataset.secure = "false";
    btn.style.color = lvlColor;
    if (icon) icon.innerHTML = '<path d="M6.5 1L1 11.5h11L6.5 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 5v2.5M6.5 9.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
  } else if (tab.url.startsWith("https://")) {
    btn.dataset.secure = "true";
    btn.style.color = "";
    if (icon) icon.innerHTML = '<path d="M4 6V4a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><rect x="2" y="6" width="9" height="6" rx="1.5" stroke="currentColor" stroke-width="1.3"/>';
  } else {
    btn.dataset.secure = "false";
    btn.style.color = "#e07040";
    if (icon) icon.innerHTML = '<path d="M6.5 1L1 11.5h11L6.5 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 5v2.5M6.5 9.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
  }
}

// ── Toolbar state ─────────────────────────────────────────────────────────────
function updateToolbar() {
  updateSecDot();
  const at=getActiveTab();
  updateSiteInfoBtn(at);
  if(!at){
    ui.addrInput.value=""; ui.backBtn.disabled=true; ui.fwdBtn.disabled=true;
    ui.reloadBtn.disabled=true; ui.bmBtn.disabled=true; ui.bmBtn.classList.remove("is-active");
    setReloadState(false); return;
  }
  if(at.type==="internal"){
    ui.addrInput.value=""; ui.bmBtn.disabled=true; ui.bmBtn.classList.remove("is-active");
  } else {
    // URL adres çubuğunda okunabilir göster (Japonca/Arapça/Türkçe encoded karakterler açılsın)
    const _displayUrl = (url) => {
      try { return decodeURIComponent(url); } catch(_) { return url; }
    };
    const _rawUrl = at.url || "";
    ui.addrInput.value = S.settings.showFullUrl
      ? _displayUrl(_rawUrl)
      : _displayUrl(_rawUrl.replace(/^https?:\/\//,"").replace(/\/$/,""));
    ui.bmBtn.disabled=false; ui.bmBtn.classList.toggle("is-active",isBookmarked(at.url));
  }
  ui.reloadBtn.disabled=false; setReloadState(at.loading||false);
  try{
    const wv=at.webview;
    ui.backBtn.disabled=!wv||at.type==="internal"||!wv.canGoBack();
    ui.fwdBtn.disabled=!wv||at.type==="internal"||!wv.canGoForward();
  } catch(_){ ui.backBtn.disabled=true; ui.fwdBtn.disabled=true; }
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
let autocompleteList=null;
function showAutocomplete(q) {
  clearAutocomplete();
  if(!q||q.length<2) return;
  const lq=q.toLowerCase();
  const matches=[...S.history,...S.bookmarks]
    .filter((e,i,arr)=>arr.findIndex(x=>x.url===e.url)===i)
    .filter(e=>(e.url||"").toLowerCase().includes(lq)||(e.title||"").toLowerCase().includes(lq))
    .slice(0,6);
  if(!matches.length) return;
  const list=document.createElement("div"); list.id="autocomplete"; list.className="autocomplete-list";
  matches.forEach(e=>{
    const item=document.createElement("button"); item.className="autocomplete-item"; item.type="button";
    const fu=faviconUrl(e.url);
    item.innerHTML=`${fu?`<img src="${esc(fu)}" width="14" height="14" style="border-radius:3px;flex-shrink:0" onerror="this.remove()">`:'<span style="width:14px;flex-shrink:0"></span>'}<span class="ac-title">${esc(trunc(e.title||e.url,40))}</span><span class="ac-url">${esc(e.url.replace(/^https?:\/\//,"").slice(0,60))}</span>`;
    item.addEventListener("mousedown",ev=>{ ev.preventDefault(); ui.addrInput.value=e.url; clearAutocomplete(); navigateCurrent(normalizeInput(e.url)); });
    list.appendChild(item);
  });
  const wrap=ui.addrInput.closest(".address-form");
  if(wrap){ wrap.style.position="relative"; wrap.appendChild(list); autocompleteList=list; }
}
function clearAutocomplete(){ if(autocompleteList){autocompleteList.remove();autocompleteList=null;} }

// ── Find in page ──────────────────────────────────────────────────────────────
function openFind() { if(!ui.findBar)return; ui.findBar.classList.add("is-open"); ui.findInput.focus(); ui.findInput.select(); findTabId=S.activeTabId; }
function closeFind() {
  if(!ui.findBar)return; ui.findBar.classList.remove("is-open");
  const at=getActiveTab(); if(at?.webview){try{B.findInPageStop(at.webview.getWebContentsId());}catch(_){}}
  ui.findInput.value=""; if(ui.findCount)ui.findCount.textContent="";
}
function doFind(fwd=true) {
  const text=ui.findInput.value.trim(); if(!text)return;
  const at=getActiveTab(); if(!at?.webview)return;
  try{
    const cid=at.webview.getWebContentsId();
    findTabId===S.activeTabId?B.findInPageNext(cid,text,fwd):(findTabId=S.activeTabId,B.findInPageStart(cid,text));
  }catch(_){}
}

// ── Reader mode ───────────────────────────────────────────────────────────────
const READER_JS=`(function(){
  const ID='_illumina_reader';
  const existing=document.getElementById(ID);
  if(existing){existing.remove();document.body.style.overflow='';return'off';}
  const SELS=['article','[role="article"]','[itemprop="articleBody"]','.post-content','.entry-content','.article-body','.article-content','.story-body','.content-body','#article-body','main'];
  let contentEl=null;
  for(const sel of SELS){const el=document.querySelector(sel);if(el&&el.innerText.trim().length>300){contentEl=el;break;}}
  if(!contentEl){let best=null,bestLen=0;document.querySelectorAll('div,section').forEach(el=>{const l=el.innerText.trim().length;if(l>bestLen&&l<document.body.innerText.length*0.9){bestLen=l;best=el;}});contentEl=best||document.body;}
  const title=document.title;
  const clone=contentEl.cloneNode(true);
  clone.querySelectorAll('script,style,iframe,nav,header,footer,aside,form,button,input,select,textarea,[class*="ad"],[id*="ad"],[class*="sidebar"],[class*="banner"],[class*="popup"],[class*="cookie"],[class*="newsletter"],[class*="subscribe"],[class*="share"],[class*="social"],[class*="related"]').forEach(e=>e.remove());
  let dark=window.matchMedia('(prefers-color-scheme:dark)').matches;
  const getBg=()=>dark?'#1a1a1e':'#fafaf8';
  const getFg=()=>dark?'#e8e8ec':'#1a1a1a';
  const getBtnBg=()=>dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.08)';
  const getBtnFg=()=>dark?'#ccc':'#444';
  const overlay=document.createElement('div');
  overlay.id=ID;
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;overflow-y:auto;background:'+getBg()+';color:'+getFg()+';padding:0';
  const inner=document.createElement('div');
  inner.style.cssText='max-width:680px;margin:0 auto;padding:48px 24px 80px';
  const toolbar=document.createElement('div');
  toolbar.style.cssText='display:flex;align-items:center;gap:10px;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid rgba(128,128,128,.2)';
  const mkBtn=(txt,extra)=>{const b=document.createElement('button');b.textContent=txt;b.style.cssText='border:0;background:'+getBtnBg()+';color:'+getBtnFg()+';padding:6px 12px;border-radius:8px;cursor:pointer;font:13px/1 system-ui;'+(extra||'');return b;};
  const closeBtn=mkBtn('✕ Kapat');closeBtn.style.borderRadius='20px';
  const smallBtn=mkBtn('A-');const largeBtn=mkBtn('A+');const darkBtn=mkBtn(dark?'☀':'🌙');
  const btnGroup=document.createElement('div');btnGroup.style.cssText='display:flex;gap:6px;margin-left:auto';
  btnGroup.append(smallBtn,largeBtn,darkBtn);toolbar.append(closeBtn,btnGroup);
  const h1=document.createElement('h1');h1.textContent=title;
  h1.style.cssText='font:700 clamp(22px,4vw,30px)/1.25 Georgia,serif;margin:0 0 24px;letter-spacing:-.02em;color:inherit';
  const body=document.createElement('div');body.id='_rd_body';
  body.style.cssText='font:18px/1.85 Georgia,serif;color:inherit';
  body.appendChild(clone);inner.append(toolbar,h1,body);overlay.appendChild(inner);
  document.body.style.overflow='hidden';document.body.appendChild(overlay);
  let fs=18;
  closeBtn.onclick=()=>{overlay.remove();document.body.style.overflow='';};
  smallBtn.onclick=()=>{fs=Math.max(14,fs-1);body.style.fontSize=fs+'px';};
  largeBtn.onclick=()=>{fs=Math.min(26,fs+1);body.style.fontSize=fs+'px';};
  darkBtn.onclick=()=>{dark=!dark;overlay.style.background=getBg();overlay.style.color=getFg();darkBtn.textContent=dark?'☀':'🌙';closeBtn.style.background=getBtnBg();closeBtn.style.color=getBtnFg();};
  overlay.querySelectorAll('a[href]').forEach(a=>{a.target='_blank';a.rel='noopener';});
  overlay.querySelectorAll('img').forEach(img=>{img.style.maxWidth='100%';img.style.height='auto';img.style.borderRadius='8px';img.style.margin='12px 0';});
  return'on';
})()`;
async function toggleReader() {
  const at=getActiveTab(); if(!at||at.type!=="web"||!at.webview)return;
  try{ readerMode=(await at.webview.executeJavaScript(READER_JS))==="on"; renderTabs(); }catch(_){}
}

// ── Focus mode ────────────────────────────────────────────────────────────────
function toggleFocus() {
  focusMode=!focusMode;
  ui.chromeShell?.classList.toggle("focus-compact",focusMode);
  ui.body.classList.toggle("focus-mode",focusMode);
  if(ui.focusBar) ui.focusBar.classList.toggle("is-hidden",!focusMode);
  if(ui.focusBtn) ui.focusBtn.classList.toggle("is-active",focusMode);
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function toggleNotes() {
  const open=ui.notesPanel?.classList.toggle("is-open");
  if(open&&ui.notesTa){ ui.notesTa.value=S.notes||""; ui.notesTa.focus(); }
  if(ui.notesToggle) ui.notesToggle.classList.toggle("is-active",open);
}
function saveNotesSoon(){ clearTimeout(notesSaveT); notesSaveT=setTimeout(()=>{S.notes=ui.notesTa?.value||""; persistSoon();},400); }

// ── Mute ──────────────────────────────────────────────────────────────────────
function toggleMute(tabId) {
  const tab=S.tabs.find(t=>t.id===tabId); if(!tab||!tab.webview)return;
  tab.muted=!tab.muted;
  try{B.audioMute(tab.webview.getWebContentsId(),tab.muted);}catch(_){}
  renderTabs();
}

// ── Tab sleep ─────────────────────────────────────────────────────────────────
function scheduleSleep(tab) {
  cancelSleep(tab.id);
  const mins=S.settings.tabSleepMinutes;
  if(!mins||tab.pinned||tab.id===S.activeTabId) return;
  sleepTimers.set(tab.id,setTimeout(()=>sleepTab(tab.id),mins*60*1000));
}
function cancelSleep(tabId){ const t=sleepTimers.get(tabId); if(t){clearTimeout(t);sleepTimers.delete(tabId);} }
function sleepTab(tabId) {
  const tab=S.tabs.find(t=>t.id===tabId); if(!tab||tab.sleeping||tab.id===S.activeTabId)return;
  tab.sleeping=true; tab.savedUrl=tab.url; tab.savedTitle=tab.title;
  if(tab.webview) tab.webview.src="about:blank";
  sleepTimers.delete(tabId); renderTabs();
}
function wakeTab(tab) {
  if(!tab.sleeping)return; tab.sleeping=false;
  if(tab.webview&&tab.savedUrl) tab.webview.src=tab.savedUrl;
  renderTabs();
}

// ── Safety engine ─────────────────────────────────────────────────────────────
function getCached(url) {
  const c=S.safetyCache.get(url); if(!c)return null;
  if(Date.now()-c.ts>5*60*1000){S.safetyCache.delete(url);return null;}
  return c.result;
}
function setCached(url,result) {
  if(S.safetyCache.size>500)S.safetyCache.clear();
  S.safetyCache.set(url,{result,ts:Date.now()});
}

function buildWarningPage(url, result) {
  const host=(()=>{try{return new URL(url).hostname;}catch(_){return url;}})();
  const cfg={
    warning:{color:"#d97706",bg:"#fef9c3",icon:"⚠️",title:"Şüpheli Site"},
    danger: {color:"#dc2626",bg:"#fee2e2",icon:"🚨",title:"Tehlikeli Olabilir"},
    blocked:{color:"#7f1d1d",bg:"#fca5a5",icon:"🛑",title:"Tehlikeli Site Engellendi"},
  }[result.level]||{color:"#d97706",bg:"#fef9c3",icon:"⚠️",title:"Şüpheli Site"};
  const reasons=(result.reasons||[]).map(r=>`<li>${r}</li>`).join("");
  const srcLabel={layer1:"Kural analizi",urlhaus:"URLhaus / abuse.ch",google_safe_browsing:"Google Safe Browsing"}[result.source]||result.source||"";
  return `data:text/html;charset=utf-8,`+encodeURIComponent(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,system-ui,sans-serif;background:${cfg.bg};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:16px;padding:36px 40px;max-width:500px;width:100%;box-shadow:0 4px 32px rgba(0,0,0,.12);border-top:4px solid ${cfg.color}}.icon{font-size:48px;margin-bottom:16px}h1{font-size:22px;color:${cfg.color};margin-bottom:8px}.host{font-size:14px;color:#64748b;margin-bottom:20px;word-break:break-all;background:#f8fafc;padding:8px 12px;border-radius:8px}ul{color:#374151;font-size:14px;line-height:1.7;padding-left:18px;margin-bottom:16px}.src{font-size:12px;color:#94a3b8;margin-bottom:24px}.actions{display:flex;gap:10px;flex-wrap:wrap}button{height:38px;padding:0 20px;border-radius:10px;border:0;font:600 13px/1 system-ui;cursor:pointer}.btn-back{background:${cfg.color};color:#fff}.btn-proceed{background:#f1f5f9;color:#475569}</style></head><body><div class="card"><div class="icon">${cfg.icon}</div><h1>${cfg.title}</h1><div class="host">${host}</div>${reasons?`<ul>${reasons}</ul>`:""}<p class="src">${srcLabel}</p><div class="actions"><button class="btn-back" onclick="history.back()">← Geri dön</button><button class="btn-proceed" onclick="window.location.href=decodeURIComponent('${encodeURIComponent(url)}')">Yine de devam et</button></div></div></body></html>`);
}

async function safeNavigate(url, tab) {
  // İç sayfalara güvenlik kontrolü yapma
  if (!url || url.startsWith("file://") || url.startsWith("about:") || url.startsWith("data:")) {
    if(tab.webview) tab.webview.src=url; else attachWebview(tab);
    return;
  }

  // Önce sayfayı yükle (kullanıcıyı beklettirme)
  if(tab.webview) tab.webview.src=httpsify(url); else attachWebview(tab);

  // Arka planda güvenlik kontrolü yap
  let result=getCached(url);
  if(!result){
    try{ result=await B.safetyCheck(url); }
    catch(_){ result={level:"safe",reasons:[],source:"error"}; }
    setCached(url,result);
  }

  // Sonucu tab'a kaydet ve ikonu güncelle
  S.tabSafetyResults.set(tab.id, result);
  if(tab.id===S.activeTabId) updateSiteInfoBtn(tab);

  // Sadece "blocked" ise uyarı sayfasına yönlendir
  if(result.level==="blocked" && tab.webview) {
    tab.webview.src=buildWarningPage(url,result);
  }
}

function navigateCurrent(url) {
  const at=getActiveTab(); if(!at){openWebTab(url,{activate:true});return;}
  // Navigasyon başlarken loading overlay göster
  const ov=document.getElementById("tab-loading-overlay");
  if(ov && at.type!=="internal") ov.classList.add("is-loading");
  at.type="web"; at.page=null; at.title=url; at.url=url; at.favicon=""; at.internalReady=false; at.sleeping=false;
  safeNavigate(url, at);
  activateTab(at.id);
}

function toggleBookmark() {
  const at=getActiveTab(); if(!at||at.type!=="web")return;
  const idx=S.bookmarks.findIndex(b=>b.url===at.url);
  idx>=0?S.bookmarks.splice(idx,1):S.bookmarks.unshift({id:uid("bm"),title:at.title||at.url,url:at.url,createdAt:new Date().toISOString()});
  S.bookmarks=S.bookmarks.slice(0,30);
  updateToolbar(); renderBmStrip(); syncInternals(); persistSoon();
}

function pinTab(tabId) {
  const tab=S.tabs.find(t=>t.id===tabId); if(!tab)return;
  tab.pinned=!tab.pinned; renderTabs(); persistSoon();
}

function updateSettings(ns) {
  S.settings = { ...S.settings, ...ns };
  applyTheme(); applyFontSize(); applyBookmarkStrip();
  applyCustomCss(); applyUiFont(); applyLanguage();
  renderTabs(); renderBmStrip(); updateToolbar(); syncInternals(); persistSoon();
}

const clearHistory   = ()=>{ S.history=[];  syncInternals(); persistSoon(); };
const clearDownloads = ()=>{ S.downloads=[]; syncInternals(); persistSoon(); };

async function handleExtAdd() {
  const r=await B.addExtension();
  if(r?.extensions) S.settings.extensions=r.extensions;
  r?.error?(S.extensionNotice=r.error,S.extensionNoticeTone="error"):r?.added&&(S.extensionNotice="Uzantı yüklendi.",S.extensionNoticeTone="success");
  syncInternals(); renderBmStrip(); persistSoon();
}
async function handleExtRemove(p) {
  const r=await B.removeExtension(p); S.settings.extensions=r?.extensions||[];
  S.extensionNotice="Uzantı kaldırıldı."; S.extensionNoticeTone="muted"; syncInternals(); persistSoon();
}
function addShortcut(url,title) {
  if(!url)return;
  if(!S.shortcuts.length) S.shortcuts=[...M().defaultShortcuts];
  S.shortcuts=[{id:uid("sc"),title:title||url,url},...S.shortcuts.filter(s=>s.url!==url)].slice(0,12);
  syncInternals(); persistSoon();
}
function removeShortcut(id){ S.shortcuts=S.shortcuts.filter(s=>s.id!==id); syncInternals(); persistSoon(); }
function editBookmark(id,t){ const b=S.bookmarks.find(x=>x.id===id); if(!b)return; b.title=t||b.url; renderBmStrip(); syncInternals(); persistSoon(); }

// ── Action handler ────────────────────────────────────────────────────────────
async function handleAction(type,payload) {
  switch(type){
    case "search":          navigateCurrent(normalizeInput(payload.query)); break;
    case "open-url":        payload.newTab?openWebTab(normalizeInput(payload.url),{activate:true}):navigateCurrent(normalizeInput(payload.url)); break;
    case "open-page":       if(payload.page)openInternal(payload.page); break;
    case "save-settings":   updateSettings(payload); break;
    case "clear-history":   clearHistory(); break;
    case "clear-downloads": clearDownloads(); break;
    case "add-extension":   await handleExtAdd(); break;
    case "remove-extension":if(payload.path)await handleExtRemove(payload.path); break;
    case "open-download":   if(payload.id)B.openDownload(payload.id); break;
    case "show-download":   if(payload.id)B.showDownloadInFolder(payload.id); break;
    case "add-shortcut":    addShortcut(payload.url,payload.title); break;
    case "remove-shortcut": if(payload.id)removeShortcut(payload.id); break;
    case "edit-bookmark":   if(payload.id)editBookmark(payload.id,payload.title); break;
  }
}

// ── Tab restore ───────────────────────────────────────────────────────────────
function restoreTabs(store) {
  const saved=store.session?.tabs||[];
  if(S.settings.restoreTabs&&saved.length){
    saved.forEach(s=>{ const t=s.type==="internal"?makeInternal(s.page||"welcome",s):makeWeb(s.url,{...s}); S.tabs.push(t); attachWebview(t); });
    S.activeTabId=store.session?.activeTabId||S.tabs[0]?.id||null; return;
  }
  openNewTab();
}

// ── Attach webview ────────────────────────────────────────────────────────────
function attachWebview(tab) {
  if(tab.webview) return tab.webview;
  const wv=document.createElement("webview");
  wv.className="browser-view";
  wv.dataset.tabId = tab.id; // tabs.js toggleTabGrid için gerekli
  
  let part = M().partition;
  if (tab.incognito) part = M().incognitoPartition;
  else if (tab.containerId) part = "persist:container_" + tab.containerId;
  
  wv.setAttribute("partition", part);
  wv.setAttribute("preload", M().webviewPreload);
  if(S.settings.allowPopups) wv.setAttribute("allowpopups","true");
  wv.src=tab.url;

  wv.addEventListener("did-start-loading",()=>{
    tab.loading=true; renderTabs(); if(tab.id===S.activeTabId)setReloadState(true);
    if (tab.id===S.activeTabId) {
      const pb=document.getElementById("page-progress");
      if(pb){pb.classList.add("active");pb.style.transform="scaleX(0.2)";pb.style.transition="transform 2s ease";setTimeout(()=>{if(pb.classList.contains("active"))pb.style.transform="scaleX(0.75)";},300);}
      // Loading overlay — sadece web sekmelerde göster
      if (tab.type==="web") {
        const ov=document.getElementById("tab-loading-overlay");
        if(ov){
          ov.classList.add("is-loading");
          // Güvenlik timeout — 5 saniye sonra her durumda kaldır
          clearTimeout(ov._safetyTimer);
          ov._safetyTimer = setTimeout(()=>ov.classList.remove("is-loading"), 5000);
        }
      }
    }
  });
  wv.addEventListener("did-stop-loading", ()=>{
    tab.loading=false; renderTabs(); updateToolbar(); scheduleSleep(tab);
    // Overlay'i HER DURUMDA kaldır — active tab kontrolü yapma
    const ov=document.getElementById("tab-loading-overlay");
    if(ov){ clearTimeout(ov._safetyTimer); ov.classList.remove("is-loading"); }
    if (tab.id===S.activeTabId) {
      const pb=document.getElementById("page-progress");
      if(pb){pb.style.transition="transform 160ms ease";pb.style.transform="scaleX(1)";setTimeout(()=>{pb.classList.remove("active");pb.style.transform="scaleX(0)";pb.style.transition="none";},200);}
    }
    // Önizleme için arka planda screenshot al (600ms bekle, sayfa render olsun)
    if (tab.type==="web" && !tab.sleeping) {
      setTimeout(async () => {
        try {
          const cid = wv.getWebContentsId?.();
          if (!cid) return;
          const r = await B.capturePreview(cid);
          if (r?.dataUrl) S.tabScreenshots.set(tab.id, r.dataUrl);
        } catch(_) {}
      }, 600);
    }
  });
  wv.addEventListener("did-fail-load", (_,code)=>{
    if(code===-3)return;
    tab.loading=false; renderTabs(); updateToolbar();
    // Overlay'i her zaman gizle — fail durumunda da
    if(tab.id===S.activeTabId){
      const ov=document.getElementById("tab-loading-overlay");
      if(ov) ov.classList.remove("is-loading");
    }
  });
  wv.addEventListener("page-title-updated",e=>{ tab.title=e.title||tab.title; renderTabs(); updateToolbar(); persistSoon(); });
  wv.addEventListener("page-favicon-updated",e=>{ tab.favicon=e.favicons?.[0]||""; renderTabs(); persistSoon(); });
  wv.addEventListener("did-navigate",()=>{
    if(tab.type==="web") commitHistory(tab,wv);
    // Navigation tamamlandı — overlay'i her durumda kaldır
    const _nav_ov=document.getElementById("tab-loading-overlay");
    if(_nav_ov){ clearTimeout(_nav_ov._safetyTimer); _nav_ov.classList.remove("is-loading"); }
    setTimeout(()=>{ if(tab.id===S.activeTabId)updateToolbar(); },100);
    // Autofill check after navigation (defined in features.js)
    setTimeout(()=>{ if(typeof checkAutoFill==="function")checkAutoFill(tab); },800);
  });
  wv.addEventListener("did-navigate-in-page",()=>{ if(tab.type==="web")commitHistory(tab,wv); });
  wv.addEventListener("dom-ready",()=>{ try{wv.setVisualZoomLevelLimits(1,3);}catch(_){} });
  wv.addEventListener("media-started-playing",()=>{ tab.audible=true;  renderTabs(); });
  wv.addEventListener("media-paused",         ()=>{ tab.audible=false; renderTabs(); });
  wv.addEventListener("found-in-page",e=>{ if(ui.findCount){const r=e.result; ui.findCount.textContent=r.matches?`${r.activeMatchOrdinal}/${r.matches}`:"";}});
  wv.addEventListener("new-window",e=>{ const d=e.disposition||"new-window"; if(d==="foreground-tab"||d==="background-tab"||S.settings.allowPopups)openWebTab(e.url,{activate:d!=="background-tab"}); });
  // Dahili sayfalar için erken state gönderimi — page-ready gelmeden önce de dene
  if (tab.type === "internal") {
    const _earlyStateTimer = setInterval(() => {
      if (tab.internalReady) { clearInterval(_earlyStateTimer); return; }
      try { sendToInternal(tab); } catch(_) {}
    }, 100);
    // 3 saniye sonra vazgeç
    setTimeout(() => clearInterval(_earlyStateTimer), 3000);
  }

  wv.addEventListener("ipc-message",e=>{
    if(e.channel==="page-ready"){
      tab.internalReady=true;
      sendToInternal(tab);
      // 200ms sonra tekrar gönder — ilk mesaj kaçmış olabilir
      setTimeout(()=>sendToInternal(tab), 200);
      return;
    }
    if(e.channel!=="page-action") return;
    const msg=e.args?.[0]||{}; void handleAction(msg.type,msg.payload||{});
  });
  tab.webview=wv; ui.webviewStack.appendChild(wv); return wv;
}

function refreshVisibility() {
  S.tabs.forEach(t => {
    if(t.webview) {
      const shouldBeActive = (typeof _splitActive !== 'undefined' && _splitActive && t.id === _splitSecondTabId) || t.id === S.activeTabId;
      if (shouldBeActive) {
        t.webview.classList.add("is-active");
        t.webview.style.opacity = "1";
      } else {
        t.webview.classList.remove("is-active");
        t.webview.style.opacity = "0";
      }
    }
  });
}

function commitHistory(tab,wv) {
  const url=wv.getURL(); if(!/^https?:\/\//i.test(url))return;
  tab.url=url; tab.title=wv.getTitle()||tab.title||url;
  S.history=[{id:uid("h"),title:tab.title,url,visitedAt:new Date().toISOString()},...S.history.filter(e=>e.url!==url)].slice(0,200);
  renderTabs(); updateToolbar(); syncInternals(); persistSoon();
}

// ── Tab operations ────────────────────────────────────────────────────────────
function activateTab(tabId) {
  const tab=S.tabs.find(t=>t.id===tabId); if(!tab)return;
  const prev=getActiveTab(); if(prev&&prev.id!==tabId)scheduleSleep(prev);
  S.activeTabId=tabId;
  cancelSleep(tabId);
  if(tab.sleeping) wakeTab(tab);
  if(findTabId&&findTabId!==tabId) closeFind();
  // Sekme değişince overlay'i SIFIRLA — clearTimeout ile eski timer'ı iptal et
  const ov=document.getElementById("tab-loading-overlay");
  if(ov){
    clearTimeout(ov._safetyTimer);
    if(tab.loading && tab.type==="web") {
      ov.classList.add("is-loading");
      ov._safetyTimer = setTimeout(()=>ov.classList.remove("is-loading"), 5000);
    } else {
      ov.classList.remove("is-loading");
    }
  }
  attachWebview(tab); refreshVisibility(); renderTabs(); renderBmStrip(); updateToolbar(); sendToInternal(tab); persistSoon();
}

function openInternal(page) {
  const ex=S.tabs.find(t=>t.type==="internal"&&t.page===page); if(ex){activateTab(ex.id);return ex;}
  const tab=makeInternal(page); S.tabs.push(tab); attachWebview(tab); activateTab(tab.id); return tab;
}
function openWebTab(url,opts={}) {
  const tab=makeWeb(url,{incognito:opts.incognito||false,pinned:opts.pinned||false,containerId:opts.containerId||null});
  S.tabs.push(tab); attachWebview(tab);
  opts.activate!==false?activateTab(tab.id):(renderTabs(),renderBmStrip(),persistSoon());
  return tab;
}
function openNewTab(incognito=false) {
  if(incognito){ openWebTab(M().pages.welcome,{incognito:true,activate:true}); return; }
  if((S.settings.startPageMode||"welcome")==="search-engine"){
    openWebTab(getEngine().home||"https://www.google.com",{activate:true});
  } else {
    // Her zaman YENİ welcome sekmesi aç, mevcut olanı aktifleştirme
    const tab=makeInternal("welcome"); S.tabs.push(tab); attachWebview(tab); activateTab(tab.id);
  }
}
function closeTab(tabId) {
  const idx=S.tabs.findIndex(t=>t.id===tabId); if(idx===-1)return;
  const [rm]=S.tabs.splice(idx,1);
  if(rm&&!rm.incognito) S.closedTabHistory.unshift({type:rm.type,page:rm.page,title:rm.title,url:rm.url,pinned:rm.pinned});
  if(S.closedTabHistory.length>10) S.closedTabHistory.pop();
  cancelSleep(tabId);
  S.tabSafetyResults.delete(tabId);
  S.tabScreenshots.delete(tabId);
  if(rm?.webview)rm.webview.remove();
  if(!S.tabs.length){openNewTab();return;}
  if(S.activeTabId===tabId){const fb=S.tabs[Math.max(0,idx-1)]||S.tabs[0]; S.activeTabId=fb.id;}
  refreshVisibility(); renderTabs(); renderBmStrip(); updateToolbar(); syncInternals(); persistSoon();
}
function reopenClosed() {
  if(!S.closedTabHistory.length)return;
  const last=S.closedTabHistory.shift();
  last.type==="internal"&&last.page?openInternal(last.page):last.url&&openWebTab(last.url,{activate:true});
}

// ── Site info popup ───────────────────────────────────────────────────────────
function toggleSiteInfo(e) {
  e?.stopPropagation();
  const popup=ui.siteInfoPopup, btn=ui.siteInfoBtn;
  if(!popup||!btn)return;
  siteInfoOpen=!siteInfoOpen;
  if(siteInfoOpen){
    const rect=btn.getBoundingClientRect();
    popup.style.top=(rect.bottom+6)+"px";
    popup.style.left=Math.max(8,rect.left-8)+"px";
    popup.style.right="auto";
    populateSiteInfo();
    if(dlPopupOpen){ dlPopupOpen=false; $("dl-popup")?.classList.remove("is-open"); }
  }
  popup.classList.toggle("is-open",siteInfoOpen);
}

function populateSiteInfo() {
  const at=getActiveTab(); if(!at||at.type!=="web")return;
  const url=at.url||"";
  let host=""; try{host=new URL(url).hostname;}catch(_){}
  const isHttps=url.startsWith("https://");
  const safetyResult=S.tabSafetyResults.get(at.id);

  const siStatus=$("si-status"), siHost=$("si-host"), siLock=$("si-lock-icon");
  const siProtocol=$("si-protocol"), siPerms=$("si-perms");
  const siSafety=$("si-safety-row");

  if(siHost) siHost.textContent=host;
  if(siProtocol){ siProtocol.textContent=isHttps?"HTTPS (Şifreli)":"HTTP (Şifresiz)"; siProtocol.style.color=isHttps?"var(--accent)":"#e07040"; }

  if(isHttps){
    if(siStatus){siStatus.textContent="Bağlantı güvenli";siStatus.style.color="var(--accent)";}
    if(siLock){siLock.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="2.5" y="6.5" width="9" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/></svg>';siLock.style.color="var(--accent)";}
  } else {
    if(siStatus){siStatus.textContent="Bağlantı güvenli değil";siStatus.style.color="#e07040";}
    if(siLock){siLock.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L1.5 11.5h11L7 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 5.5v2.5M7 10h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';siLock.style.color="#e07040";}
  }

  // Safety result
  if(siSafety){
    if(safetyResult&&safetyResult.level!=="safe"){
      const lvlLabel={warning:"⚠️ Şüpheli",danger:"🚨 Riskli",blocked:"🛑 Tehlikeli"}[safetyResult.level]||safetyResult.level;
      const lvlColor={warning:"#d97706",danger:"#e07040",blocked:"#dc2626"}[safetyResult.level]||"#e07040";
      siSafety.innerHTML=`<div class="si-row"><span class="si-label">Güvenlik tarama</span><span class="si-value" style="color:${lvlColor}">${lvlLabel}</span></div>`;
      if(safetyResult.reasons?.length){
        siSafety.innerHTML+=`<div style="font-size:11px;color:var(--text-2);padding:2px 0 4px;line-height:1.5">${safetyResult.reasons.slice(0,2).join("<br>")}</div>`;
      }
      siSafety.style.display="block";
    } else {
      siSafety.innerHTML=`<div class="si-row"><span class="si-label">Güvenlik tarama</span><span class="si-value" style="color:var(--accent)">✓ Temiz</span></div>`;
      siSafety.style.display="block";
    }
  }

  // Shields satırı
  const siShields = document.getElementById("si-shields-row");
  if (siShields) {
    const adOn = S.settings.adBlockEnabled !== false;
    const blk  = window._adBlockPageCount || 0;
    siShields.innerHTML = `<div class="si-row"><span class="si-label">Shields</span><span class="shields-badge ${adOn?"on":"off"}">${adOn?(blk>0?blk+" engellendi":"Aktif"):"Kapalı"}</span></div>`;
    siShields.style.display="block";
  }

  const perms=[];
  if(S.settings.allowNotifications)perms.push("Bildirim");
  if(S.settings.allowLocation)perms.push("Konum");
  if(S.settings.allowCamera)perms.push("Kamera");
  if(S.settings.allowMicrophone)perms.push("Mikrofon");
  if(siPerms)siPerms.textContent=perms.length?perms.join(", "):"Yok";

  const pState=a=>a?'<span style="color:var(--accent)">İzin verildi</span>':'<span style="color:var(--text-2)">Engellendi</span>';
  const notifS=$("si-notif-state"),locS=$("si-loc-state"),camS=$("si-cam-state"),micS=$("si-mic-state");
  if(notifS)notifS.innerHTML=pState(S.settings.allowNotifications);
  if(locS)  locS.innerHTML  =pState(S.settings.allowLocation);
  if(camS)  camS.innerHTML  =pState(S.settings.allowCamera);
  if(micS)  micS.innerHTML  =pState(S.settings.allowMicrophone);
}

document.addEventListener("click",e=>{
  if(siteInfoOpen&&!e.target.closest("#site-info-popup")&&!e.target.closest("#site-info-btn")){
    siteInfoOpen=false; ui.siteInfoPopup?.classList.remove("is-open");
  }
});

// ── Downloads popup ───────────────────────────────────────────────────────────
function renderDownloadsPopup() {
  const panel=$("dl-popup"); if(!panel)return;
  const items=S.downloads.slice(0,8);
  const fmtBytes=b=>{if(!b)return"0 B";const u=["B","KB","MB","GB"],i=Math.floor(Math.log(b)/Math.log(1024));return`${(b/Math.pow(1024,i)).toFixed(1)} ${u[i]}`;};
  const list=panel.querySelector(".dl-popup-list");
  if(!items.length){list.innerHTML='<p class="dl-empty">Henüz indirme yok.</p>';return;}
  list.innerHTML=items.map(d=>{
    const pct=d.totalBytes>0?Math.min(100,Math.round(d.receivedBytes/d.totalBytes*100)):null;
    const stateIcon={completed:"✓",progressing:"↓",interrupted:"✗",cancelled:"✗"}[d.state]||"?";
    const stateColor={completed:"var(--accent)",progressing:"#4a7fc1",interrupted:"#c04040",cancelled:"#c04040"}[d.state]||"var(--text-2)";
    return `<div class="dl-popup-item">
      <div class="dl-popup-name" title="${esc(d.filename)}">${esc(trunc(d.filename,36))}</div>
      ${pct!==null?`<div class="dl-popup-bar"><div class="dl-popup-fill" style="width:${pct}%"></div></div>`:""}
      <div class="dl-popup-meta">
        <span style="color:${stateColor};font-weight:600">${stateIcon}</span>
        <span>${d.state==="progressing"&&pct!==null?`${fmtBytes(d.receivedBytes)}/${fmtBytes(d.totalBytes)} ${pct}%`:fmtBytes(d.totalBytes)||""}</span>
        ${d.state==="completed"?`<button class="dl-popup-open" data-id="${esc(d.id)}" type="button">Aç</button>`:""}
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll(".dl-popup-open").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();B.openDownload(b.dataset.id);}));
}
function toggleDlPopup(e) {
  e?.stopPropagation();
  const panel=$("dl-popup"), btn=$("dl-popup-btn");
  if(!panel||!btn)return;
  dlPopupOpen=!dlPopupOpen;
  if(dlPopupOpen){
    const rect=btn.getBoundingClientRect();
    panel.style.top=(rect.bottom+6)+"px";
    panel.style.right=(window.innerWidth-rect.right)+"px";
    panel.style.left="auto";
    renderDownloadsPopup();
    if(siteInfoOpen){siteInfoOpen=false;ui.siteInfoPopup?.classList.remove("is-open");}
    if(histPopupOpen){histPopupOpen=false;$("hist-popup")?.classList.remove("is-open");}
  }
  panel.classList.toggle("is-open",dlPopupOpen);
}
document.addEventListener("click",e=>{
  if(dlPopupOpen&&!e.target.closest("#dl-popup")&&!e.target.closest("#dl-popup-btn")){
    dlPopupOpen=false; $("dl-popup")?.classList.remove("is-open");
  }
});

// ── History popup ─────────────────────────────────────────────────────────────
function renderHistPopup() {
  const panel=$("hist-popup"); if(!panel)return;
  const items=S.history.slice(0,8);
  const list=panel.querySelector(".hist-popup-list");
  if(!items.length){list.innerHTML='<p class="dl-empty">Henüz geçmiş yok.</p>';return;}
  list.innerHTML=items.map(h=>`
    <button class="hist-popup-item" type="button" data-url="${esc(h.url)}">
      <img src="${esc(faviconUrl(h.url))}" width="14" height="14" style="border-radius:3px;flex-shrink:0" onerror="this.style.display='none'" />
      <span class="hist-popup-title">${esc(trunc(h.title||h.url,36))}</span>
    </button>
  `).join("");
  list.querySelectorAll("[data-url]").forEach(b=>b.addEventListener("click",e=>{
    e.stopPropagation();
    histPopupOpen=false; $("hist-popup")?.classList.remove("is-open");
    navigateCurrent(b.dataset.url);
  }));
}
function toggleHistPopup(e) {
  e?.stopPropagation();
  const panel=$("hist-popup"), btn=ui.histPopupBtn;
  if(!panel||!btn)return;
  histPopupOpen=!histPopupOpen;
  if(histPopupOpen){
    const rect=btn.getBoundingClientRect();
    panel.style.top=(rect.bottom+6)+"px";
    panel.style.right=(window.innerWidth-rect.right)+"px";
    panel.style.left="auto";
    renderHistPopup();
    if(dlPopupOpen){dlPopupOpen=false;$("dl-popup")?.classList.remove("is-open");}
    if(siteInfoOpen){siteInfoOpen=false;ui.siteInfoPopup?.classList.remove("is-open");}
  }
  panel.classList.toggle("is-open",histPopupOpen);
}
document.addEventListener("click",e=>{
  if(histPopupOpen&&!e.target.closest("#hist-popup")&&!e.target.closest("#hist-popup-btn")){
    histPopupOpen=false; $("hist-popup")?.classList.remove("is-open");
  }
});

// ── Bind events ───────────────────────────────────────────────────────────────
function bindEvents() {
  ui.brandBtn.addEventListener("click",()=>openInternal("welcome"));
  ui.newTabBtn.addEventListener("click",()=>openNewTab());

  // Address form submit — arama VE navigasyon
  ui.addrForm.addEventListener("submit",e=>{
    e.preventDefault();
    const v=ui.addrInput.value.trim();
    if(!v) return;
    clearAutocomplete();
    navigateCurrent(normalizeInput(v));
  });
  ui.addrInput.addEventListener("focus",()=>ui.addrInput.select());
  ui.addrInput.addEventListener("input",()=>showAutocomplete(ui.addrInput.value));
  ui.addrInput.addEventListener("blur",()=>setTimeout(clearAutocomplete,150));
  ui.addrInput.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&autocompleteList){e.preventDefault();clearAutocomplete();}
    if(e.key==="Enter"&&!e.isComposing){
      e.preventDefault();
      clearAutocomplete();
      navigateCurrent(normalizeInput(ui.addrInput.value.trim()));
    }
  });

  ui.backBtn.addEventListener("click",()=>{ const at=getActiveTab(); if(at?.type==="web"&&at.webview?.canGoBack())at.webview.goBack(); });
  ui.fwdBtn.addEventListener("click",()=>{ const at=getActiveTab(); if(at?.type==="web"&&at.webview?.canGoForward())at.webview.goForward(); });
  ui.reloadBtn.addEventListener("click",()=>{ const at=getActiveTab(); if(!at?.webview)return; reloadIsStop?at.webview.stop():at.webview.reload(); });
  ui.bmBtn.addEventListener("click",toggleBookmark);
  ui.pageButtons.forEach(b=>b.addEventListener("click",()=>openInternal(b.dataset.page)));

  if(ui.findInput)   ui.findInput.addEventListener("input",()=>doFind(true));
  if(ui.findInput)   ui.findInput.addEventListener("keydown",e=>{ if(e.key==="Enter")e.shiftKey?doFind(false):doFind(true); if(e.key==="Escape")closeFind(); });
  if(ui.findPrev)    ui.findPrev.addEventListener("click",()=>doFind(false));
  if(ui.findNext)    ui.findNext.addEventListener("click",()=>doFind(true));
  if(ui.findClose)   ui.findClose.addEventListener("click",closeFind);
  if(ui.notesToggle) ui.notesToggle.addEventListener("click",toggleNotes);
  if(ui.notesClose)  ui.notesClose.addEventListener("click",()=>{ ui.notesPanel?.classList.remove("is-open"); ui.notesToggle?.classList.remove("is-active"); });
  if(ui.notesClear)  ui.notesClear.addEventListener("click",()=>{ if(ui.notesTa){ui.notesTa.value="";S.notes="";persistSoon();} });
  if(ui.notesTa)     ui.notesTa.addEventListener("input",saveNotesSoon);
  if(ui.readerBtn)   ui.readerBtn.addEventListener("click",toggleReader);
  if(ui.focusBtn)    ui.focusBtn.addEventListener("click",toggleFocus);
  if(ui.focusExit)   ui.focusExit.addEventListener("click",()=>focusMode&&toggleFocus());
  if(ui.incognitoBtn)ui.incognitoBtn.addEventListener("click",()=>openNewTab(true));
  if(ui.devtoolsBtn) ui.devtoolsBtn.addEventListener("click",()=>{ const at=getActiveTab(); if(at?.webview){try{at.webview.openDevTools();}catch(_){}} });
  if(ui.siteInfoBtn) ui.siteInfoBtn.addEventListener("click",toggleSiteInfo);
  if(ui.histPopupBtn)ui.histPopupBtn.addEventListener("click",toggleHistPopup);

  const dlBtn=$("dl-popup-btn"); if(dlBtn)dlBtn.addEventListener("click",toggleDlPopup);

  B.onCtxOpenUrl(url=>openWebTab(url,{activate:true}));
  B.onCtxSearchSelection(text=>navigateCurrent(normalizeInput(text)));
  B.onCtxFindInPage(openFind);

  window.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey,at=getActiveTab();
    if(ctrl&&k==="l")               {e.preventDefault();ui.addrInput.focus();ui.addrInput.select();return;}
    if(ctrl&&!e.shiftKey&&k==="t")  {e.preventDefault();openNewTab();return;}
    if(ctrl&&e.shiftKey&&k==="t")   {e.preventDefault();reopenClosed();return;}
    if(ctrl&&e.shiftKey&&k==="n")   {e.preventDefault();openNewTab(true);return;}
    if(ctrl&&k==="w")               {e.preventDefault();if(S.activeTabId)closeTab(S.activeTabId);return;}
    if(ctrl&&k===",")               {e.preventDefault();openInternal("settings");return;}
    if((ctrl&&k==="r")||k==="f5")   {e.preventDefault();if(at?.webview){e.shiftKey?at.webview.reloadIgnoringCache():at.webview.reload();}return;}
    if(k==="escape"&&reloadIsStop)  {at?.webview?.stop();return;}
    if(k==="escape"&&ui.findBar?.classList.contains("is-open")){closeFind();return;}
    if(k==="escape"&&focusMode)     {toggleFocus();return;}
    if(k==="f12")                   {e.preventDefault();if(at?.webview){try{at.webview.openDevTools();}catch(_){}}return;}
    if(ctrl&&k==="f")               {e.preventDefault();if(at?.type==="web")openFind();return;}
    if(ctrl&&k==="g")               {e.preventDefault();if(ui.findBar?.classList.contains("is-open"))e.shiftKey?doFind(false):doFind(true);return;}
    if(ctrl&&k==="n"&&!e.shiftKey)  {e.preventDefault();toggleNotes();return;}
    if(!e.shiftKey&&ctrl&&k==="tab"){e.preventDefault();const i=S.tabs.findIndex(t=>t.id===S.activeTabId);if(i!==-1&&S.tabs.length>1)activateTab(S.tabs[(i+1)%S.tabs.length].id);return;}
    if(e.shiftKey&&ctrl&&k==="tab") {e.preventDefault();const i=S.tabs.findIndex(t=>t.id===S.activeTabId);if(i!==-1&&S.tabs.length>1)activateTab(S.tabs[(i-1+S.tabs.length)%S.tabs.length].id);return;}
    if(ctrl&&k>="1"&&k<="8")       {e.preventDefault();const t=S.tabs[parseInt(k,10)-1];if(t)activateTab(t.id);return;}
    if(ctrl&&k==="9")               {e.preventDefault();const t=S.tabs[S.tabs.length-1];if(t)activateTab(t.id);return;}
    if(e.altKey&&k==="arrowleft")   {e.preventDefault();if(at?.type==="web"&&at.webview?.canGoBack())at.webview.goBack();return;}
    if(e.altKey&&k==="arrowright")  {e.preventDefault();if(at?.type==="web"&&at.webview?.canGoForward())at.webview.goForward();return;}
    if(ctrl&&k==="h")               {e.preventDefault();openInternal("history");return;}
    if(ctrl&&k==="j")               {e.preventDefault();openInternal("downloads");return;}
    if(ctrl&&k==="k")               {e.preventDefault();if(typeof openCommandBar==="function")openCommandBar();return;}
    if(ctrl&&k==="d")               {e.preventDefault();toggleBookmark();return;}
    if(ctrl&&k==="p")               {e.preventDefault();if(S.activeTabId)pinTab(S.activeTabId);return;}
  });

  B.onDownloadsUpdated(dl=>{ S.downloads=Array.isArray(dl)?dl:[]; if(dlPopupOpen)renderDownloadsPopup(); syncInternals(); persistSoon(); });
  document.addEventListener("open-downloads-page",()=>{ dlPopupOpen=false; $("dl-popup")?.classList.remove("is-open"); openInternal("downloads"); });
  document.addEventListener("open-history-page",()=>{ histPopupOpen=false; $("hist-popup")?.classList.remove("is-open"); openInternal("history"); });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  // ── 1. Meta verilerini yükle (sandbox:true — preload require yapamaz) ──
  const meta = await B.loadMeta();
  // contextBridge objesi dondurulmuş, doğrudan assign edilemez
  // Meta verilerini ayrı değişkende sakla, renderer bunları M.xxx ile erişir
  window._illuminaMeta = meta;
  // SEC_LABELS'i şimdi doldur
  SEC_LABELS = Object.fromEntries((meta.securityModes||[]).map(m=>[m.id,m.label]));
  // Varsayılan settings'i meta'dan al
  S.settings = { ...(meta.defaultSettings || {}) };

  bindEvents();
  const store=await B.loadStore();
  const exts =await B.listExtensions();
  S.settings={...S.settings,...(store.settings||{}),extensions:Array.isArray(exts)?exts:store.settings?.extensions||[]};
  S.tabGroups =Array.isArray(store.tabGroups)?store.tabGroups:[];
  S.bookmarks =Array.isArray(store.bookmarks)?store.bookmarks:[];
  S.history   =Array.isArray(store.history)  ?store.history  :[];
  S.downloads =Array.isArray(store.downloads)?store.downloads:[];
  S.shortcuts =Array.isArray(store.shortcuts)?store.shortcuts:[];
  S.notes     =typeof store.notes==="string" ?store.notes    :"";
  if(ui.notesTa)ui.notesTa.value=S.notes;
  S.bmFolders = Array.isArray(store.bmFolders) ? store.bmFolders : [];
  applyTheme(); applyFontSize(); applyBookmarkStrip();
  applyCustomCss(); applyUiFont(); applyLanguage();
  restoreTabs(store);
  if(S.tabs.length&&!S.activeTabId)S.activeTabId=S.tabs[0].id;
  if(S.activeTabId)activateTab(S.activeTabId);
  else{renderTabs();renderBmStrip();updateToolbar();}
  syncInternals();

  // Clipboard intercept
  try {
    const _origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      await _origWrite(text);
      B.addClipboard?.(text).catch(() => {});
    };
  } catch(_) {}

  // Tray + context menu listeners
  B.onTrayAction?.((action) => {
    if (action === "new-tab") openNewTab();
    else if (action === "incognito-tab") openNewTab(true);
  });
  B.onCtxScreenshot?.(() => takeScreenshot());
  B.onCtxAddResearch?.((data) => { if(typeof addResearchNote==="function") addResearchNote(data); });

  // Güvenlik engeli — blocked URL'de uyarı göster
  B.onSafetyBlocked?.((data) => {
    if (!data?.url || !data?.result) return;
    const at = getActiveTab();
    if (at?.type === "web" && at.webview) {
      at.webview.src = buildWarningPage(data.url, data.result);
    }
  });
}

bootstrap().then(() => {
  // Bootstrap bitti — dahili sekmelere state gönder
  // Birkaç kez dene çünkü webview henüz tam hazır olmayabilir
  [100, 300, 600, 1200].forEach(ms => setTimeout(syncInternals, ms));
});

// ═══════════════════════════════════════════════════════════════════════════════
// ILLUMINA FEATURES — Yan Panel, Oturum, Tema Editörü, Şifre, Çerez, vb.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Yer imi şeridi (klasör desteği ile override) ──────────────────────────────
function renderBmStrip() {
  if (!ui.bmStrip) return;
  ui.bmStrip.innerHTML = "";
  const at = getActiveTab();
  ["welcome","history","downloads","settings"].forEach(page => {
    const b = document.createElement("button");
    b.className = "bookmark-chip secondary"; b.type = "button"; b.textContent = PAGE_LABELS[page];
    b.addEventListener("click", () => openInternal(page));
    if (at?.type === "internal" && at.page === page) b.classList.add("is-active");
    ui.bmStrip.appendChild(b);
  });
  if (S.bookmarks.length || S.bmFolders.length) {
    const sp = document.createElement("div");
    sp.style.cssText = "width:1px;height:14px;background:var(--line-mid);align-self:center;margin:0 4px;flex-shrink:0";
    ui.bmStrip.appendChild(sp);
  }
  S.bmFolders.forEach(folder => {
    const bms = S.bookmarks.filter(b => b.folderId === folder.id);
    if (!bms.length) return;
    const btn = document.createElement("button"); btn.className = "bookmark-chip"; btn.type = "button";
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 3.5h9a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 .5 9V4a.5.5 0 0 1 .5-.5Z" stroke="currentColor" stroke-width="1.2"/><path d="M.5 3.5L2 1.5h3l1 2" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg> ${esc(trunc(folder.name, 12))}`;
    btn.title = folder.name;
    btn.addEventListener("click", e => { e.stopPropagation(); showFolderDD(folder, bms, btn); });
    ui.bmStrip.appendChild(btn);
  });
  S.bookmarks.filter(bm => !bm.folderId).slice(0, 14).forEach(bm => {
    const b = document.createElement("button"); b.className = "bookmark-chip"; b.type = "button"; b.title = bm.url;
    const fu = faviconUrl(bm.url);
    if (fu) { const img = document.createElement("img"); img.src = fu; img.width = 12; img.height = 12; img.style.cssText = "border-radius:2px;flex-shrink:0;margin-right:3px"; img.onerror = () => img.remove(); b.appendChild(img); }
    const sp = document.createElement("span"); sp.textContent = trunc(bm.title || bm.url, 18); b.appendChild(sp);
    b.addEventListener("click", () => navigateCurrent(bm.url));
    b.addEventListener("contextmenu", e => { e.preventDefault(); showBmCtx(bm, b); });
    ui.bmStrip.appendChild(b);
  });
}

let _fdd = null;
function showFolderDD(folder, bms, anchor) {
  if (_fdd) { _fdd.remove(); _fdd = null; return; }
  const dd = document.createElement("div");
  dd.style.cssText = "position:fixed;z-index:9990;background:var(--panel);border:1px solid var(--line-mid);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.14);padding:4px;min-width:180px;max-height:240px;overflow-y:auto";
  bms.forEach(bm => {
    const item = document.createElement("button");
    item.style.cssText = "display:flex;align-items:center;gap:7px;width:100%;padding:7px 10px;border:0;background:0;cursor:pointer;font-size:12.5px;color:var(--text);border-radius:7px;text-align:left";
    item.onmouseover = () => item.style.background = "var(--accent-soft)"; item.onmouseout = () => item.style.background = "";
    const fu = faviconUrl(bm.url);
    item.innerHTML = `${fu ? `<img src="${esc(fu)}" width="12" height="12" style="border-radius:2px;flex-shrink:0" onerror="this.remove()">` : ""}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(trunc(bm.title || bm.url, 28))}</span>`;
    item.addEventListener("click", () => { navigateCurrent(bm.url); dd.remove(); _fdd = null; });
    dd.appendChild(item);
  });
  document.body.appendChild(dd); _fdd = dd;
  const rect = anchor.getBoundingClientRect();
  dd.style.left = rect.left + "px"; dd.style.top = (rect.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("click", () => { dd.remove(); _fdd = null; }, { once: true }), 10);
}

function showBmCtx(bm, anchor) {
  const menu = document.createElement("div");
  menu.style.cssText = "position:fixed;z-index:9999;background:var(--panel);border:1px solid var(--line-mid);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.16);padding:4px;min-width:190px";
  const add = (label, action, danger = false) => {
    const b = document.createElement("button");
    b.style.cssText = `display:block;width:100%;text-align:left;padding:7px 12px;border:0;background:0;cursor:pointer;font-size:12.5px;color:${danger ? "#e07040" : "var(--text)"};border-radius:7px`;
    b.onmouseover = () => b.style.background = "var(--accent-soft)"; b.onmouseout = () => b.style.background = "";
    b.textContent = label; b.addEventListener("click", () => { menu.remove(); action(); }); menu.appendChild(b);
  };
  const sep = () => { const d = document.createElement("div"); d.style.cssText = "height:1px;background:var(--line);margin:3px 6px"; menu.appendChild(d); };
  add("Adı düzenle", () => { const t = prompt("Yer imi adı:", bm.title || bm.url); if (t !== null && t.trim()) { bm.title = t.trim(); renderBmStrip(); syncInternals(); persistSoon(); } });
  add("Klasöre taşı", () => showFolderPicker(bm));
  sep();
  add("Sil", () => { const i = S.bookmarks.findIndex(b => b.id === bm.id); if (i >= 0) S.bookmarks.splice(i, 1); updateToolbar(); renderBmStrip(); syncInternals(); persistSoon(); }, true);
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = rect.left + "px"; menu.style.top = (rect.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 10);
}

function showFolderPicker(bm) {
  const bd = document.createElement("div"); bd.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.2)";
  const w = document.createElement("div");
  w.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;background:var(--panel);border:1px solid var(--line-mid);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.2);padding:16px;min-width:240px";
  w.innerHTML = '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px">Klasör Seç</div>';
  const addOpt = (label, action) => {
    const b = document.createElement("button"); b.style.cssText = "display:block;width:100%;text-align:left;padding:7px 10px;border:0;background:0;cursor:pointer;font-size:12.5px;color:var(--text);border-radius:7px";
    b.onmouseover = () => b.style.background = "var(--accent-soft)"; b.onmouseout = () => b.style.background = "";
    b.textContent = label; b.addEventListener("click", () => { bd.remove(); w.remove(); action(); }); w.appendChild(b);
  };
  addOpt("— Klasörsüz —", () => { bm.folderId = null; renderBmStrip(); syncInternals(); persistSoon(); B.saveBmFolders?.(S.bmFolders).catch(() => {}); });
  S.bmFolders.forEach(f => addOpt("📁 " + f.name, () => { bm.folderId = f.id; renderBmStrip(); syncInternals(); persistSoon(); B.saveBmFolders?.(S.bmFolders).catch(() => {}); }));
  addOpt("+ Yeni klasör oluştur", () => {
    const name = prompt("Yeni klasör adı:");
    if (name?.trim()) {
      const f = { id: uid("f"), name: name.trim(), createdAt: new Date().toISOString() };
      S.bmFolders.push(f); bm.folderId = f.id;
      renderBmStrip(); syncInternals(); persistSoon(); B.saveBmFolders?.(S.bmFolders).catch(() => {});
    }
  });
  bd.addEventListener("click", () => { bd.remove(); w.remove(); });
  document.body.appendChild(bd); document.body.appendChild(w);
}