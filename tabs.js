"use strict";
// ═══════════════════════════════════════════════════════════════
// tabs.js — Sekme yönetimi: hover preview, zoom, drag sort,
//           sekme arama, kilitleme, ekran görüntüsü, çeviri
// ═══════════════════════════════════════════════════════════════

// ── Hover Önizleme ──────────────────────────────────────────────
let _pvEl = null, _pvTimer = null, _pvActiveRow = null;

document.addEventListener("pointermove", e => {
  if (!_pvEl || !_pvActiveRow) return;
  const tabBarRect = ui.tabsBar.getBoundingClientRect();
  const pvRect = _pvEl.getBoundingClientRect();
  const inBar = e.clientY >= tabBarRect.top && e.clientY <= tabBarRect.bottom + 10;
  const inPv  = e.clientX >= pvRect.left && e.clientX <= pvRect.right && e.clientY >= pvRect.top && e.clientY <= pvRect.bottom;
  if (!inBar && !inPv) hideTabPreview();
});
window.addEventListener("blur", hideTabPreview);
document.addEventListener("scroll", hideTabPreview, true);

function initTabHoverPreview() {
  const obs = new MutationObserver(attachTabHovers);
  obs.observe(ui.tabsBar, { childList: true });
  attachTabHovers();
}

function attachTabHovers() {
  ui.tabsBar.querySelectorAll(".tab-card:not([data-hv])").forEach(row => {
    row.dataset.hv = "1";
    row.addEventListener("mouseenter", () => {
      const tab = S.tabs.find(t => t.id === row.dataset.tabId);
      if (!tab) return;
      _pvActiveRow = row; clearTimeout(_pvTimer);
      _pvTimer = setTimeout(() => showTabPreview(tab, row), 380);
    });
    row.addEventListener("mouseleave", e => {
      if (_pvEl) { const r = _pvEl.getBoundingClientRect(); if (e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom) return; }
      clearTimeout(_pvTimer);
      _pvTimer = setTimeout(() => { if (_pvActiveRow===row) hideTabPreview(); }, 60);
    });
    row.addEventListener("click", hideTabPreview);
  });
}

function hideTabPreview() {
  clearTimeout(_pvTimer); _pvTimer = null; _pvActiveRow = null;
  if (_pvEl) { _pvEl.remove(); _pvEl = null; }
}

function showTabPreview(tab, anchor) {
  if (_pvEl) { _pvEl.remove(); _pvEl = null; }
  const PW = 280;
  const el = document.createElement("div"); el.id = "_tab_pv"; _pvEl = el;
  el.style.cssText = ["position:fixed","z-index:9997","background:var(--panel)","border:1px solid var(--line-mid)","border-radius:12px","box-shadow:0 8px 28px rgba(0,0,0,.18)",`width:${PW}px`,"overflow:hidden","pointer-events:auto","opacity:0","transition:opacity 80ms"].join(";");
  const imgWrap = document.createElement("div");
  imgWrap.style.cssText = `width:${PW}px;height:157px;background:var(--panel-soft);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center`;
  const cached = S.tabScreenshots?.get(tab.id);
  if (cached) {
    const img = document.createElement("img"); img.src = cached;
    img.style.cssText = `width:${PW}px;height:157px;object-fit:cover;object-position:top;display:block`;
    imgWrap.appendChild(img);
  } else {
    const fu = tab.favicon||(tab.type==="web"?faviconUrl(tab.url):"");
    const ph = document.createElement("div"); ph.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:8px;opacity:.4";
    if (fu) { const pi=document.createElement("img");pi.src=fu;pi.width=28;pi.height=28;pi.style.cssText="border-radius:6px";pi.onerror=()=>pi.remove();ph.appendChild(pi); }
    const pt = document.createElement("div"); pt.style.cssText = "font-size:10.5px;color:var(--text-2)";
    pt.textContent = tab.sleeping?"Uyuyor":tab.type==="internal"?"İç sayfa":tab.title||"…";
    ph.appendChild(pt); imgWrap.appendChild(ph);
    if (tab.type==="web"&&!tab.sleeping&&tab.webview) {
      const cid = tab.webview.getWebContentsId?.();
      if (cid) B.capturePreview(cid).then(r=>{
        if(!r?.dataUrl||_pvEl!==el)return;
        S.tabScreenshots?.set(tab.id,r.dataUrl);
        imgWrap.innerHTML="";
        const img=document.createElement("img");img.src=r.dataUrl;
        img.style.cssText=`width:${PW}px;height:157px;object-fit:cover;object-position:top;display:block`;
        imgWrap.appendChild(img);
      }).catch(()=>{});
    }
  }
  el.appendChild(imgWrap);
  const fu = tab.favicon||(tab.type==="web"?faviconUrl(tab.url):"");
  const info = document.createElement("div"); info.style.cssText = "display:flex;align-items:center;gap:7px;padding:8px 10px;border-top:1px solid var(--line)";
  if (fu) { const fi=document.createElement("img");fi.src=fu;fi.width=14;fi.height=14;fi.style.cssText="border-radius:3px;flex-shrink:0";fi.onerror=()=>fi.remove();info.appendChild(fi); }
  const infoText = document.createElement("div"); infoText.style.cssText = "flex:1;min-width:0";
  const titleEl = document.createElement("div"); titleEl.style.cssText = "font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"; titleEl.textContent = tab.title||"Yeni Sekme";
  const urlEl = document.createElement("div"); urlEl.style.cssText = "font-size:10.5px;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px"; urlEl.textContent = tab.url?tab.url.replace(/^https?:\/\//,"").slice(0,36):"";
  infoText.append(titleEl,urlEl); info.appendChild(infoText);
  const badge = tab.sleeping?"Uyuyor":tab.audible?"♪":tab.muted?"🔇":tab.incognito?"Gizli":tab.locked?"🔒":"";
  if (badge) { const b=document.createElement("span");b.style.cssText="font-size:10px;background:var(--accent-soft);color:var(--accent);padding:2px 6px;border-radius:4px;flex-shrink:0";b.textContent=badge;info.appendChild(b); }
  el.appendChild(info);
  document.body.appendChild(el);
  const rect = anchor.getBoundingClientRect();
  let left = rect.left+rect.width/2-PW/2;
  left = Math.max(8,Math.min(left,window.innerWidth-PW-8));
  el.style.left = left+"px"; el.style.top = (rect.bottom+5)+"px";
  requestAnimationFrame(()=>{ if(_pvEl===el)el.style.opacity="1"; });
}

// ── Zoom Göstergesi ─────────────────────────────────────────────
let _zoom = 0, _zoomT = null;

function showZoomBadge(level) {
  let el = document.getElementById("_zb");
  if (!el) { el=document.createElement("div");el.id="_zb";el.style.cssText="position:fixed;bottom:20px;right:20px;z-index:9990;background:var(--panel);border:1px solid var(--line-mid);border-radius:8px;padding:5px 14px;font-size:13px;font-weight:700;color:var(--text);box-shadow:0 2px 10px rgba(0,0,0,.12);pointer-events:none;transition:opacity 200ms";document.body.appendChild(el); }
  el.textContent = Math.round(Math.pow(1.2,level)*100)+"%"; el.style.opacity = "1";
  clearTimeout(_zoomT); _zoomT = setTimeout(()=>el.style.opacity="0",1800);
}

window.addEventListener("keydown", e => {
  if (!e.ctrlKey&&!e.metaKey) return;
  const at = getActiveTab(); if (!at?.webview||at.type!=="web") return;
  if (e.key==="="||e.key==="+") { e.preventDefault();_zoom=Math.min(_zoom+1,7);try{at.webview.setZoomLevel(_zoom);}catch(_){}showZoomBadge(_zoom); }
  else if (e.key==="-") { e.preventDefault();_zoom=Math.max(_zoom-1,-7);try{at.webview.setZoomLevel(_zoom);}catch(_){}showZoomBadge(_zoom); }
  else if (e.key==="0") { e.preventDefault();_zoom=0;try{at.webview.setZoomLevel(0);}catch(_){}showZoomBadge(0); }
}, true);

// ── Drag & Drop (URL bırak) ─────────────────────────────────────
(function(){
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,100,255,.08);border:3px dashed var(--accent);border-radius:12px;display:none;align-items:center;justify-content:center;pointer-events:none";
  ov.innerHTML = '<div style="background:var(--panel);border-radius:12px;padding:20px 32px;font-size:15px;font-weight:600;color:var(--text);text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.15)">Dosyayı bırak<br><span style="font-size:12px;font-weight:400;color:var(--text-2)">URL veya HTML dosyası</span></div>';
  document.body.appendChild(ov);
  let cnt = 0;
  document.addEventListener("dragenter", e=>{e.preventDefault();cnt++;ov.style.display="flex";});
  document.addEventListener("dragleave", ()=>{cnt=Math.max(0,cnt-1);if(!cnt)ov.style.display="none";});
  document.addEventListener("dragover", e=>e.preventDefault());
  document.addEventListener("drop", e=>{
    e.preventDefault();cnt=0;ov.style.display="none";
    const url=e.dataTransfer?.getData("text/uri-list")||e.dataTransfer?.getData("text/plain")||"";
    if (url&&(url.startsWith("http")||url.startsWith("www"))) { navigateCurrent(normalizeInput(url)); return; }
    Array.from(e.dataTransfer?.files||[]).forEach(f=>showToast("Dosya bırakıldı: "+f.name));
  });
})();

// ── Ekran Görüntüsü ─────────────────────────────────────────────
async function takeScreenshot() {
  const at = getActiveTab(); if (!at?.webview||at.type!=="web") return;
  showToast("Ekran görüntüsü alınıyor…");
  try {
    const r = await B.captureScreenshot?.(at.webview.getWebContentsId());
    r?.saved ? showToast("Kaydedildi: "+(r.path||"").split(/[/\\]/).pop()) : showToast("Hata: "+(r?.error||"?"));
  } catch(e) { showToast("Hata: "+e.message); }
}

// ── Çeviri ──────────────────────────────────────────────────────
function translatePage() {
  const at = getActiveTab(); if (!at?.url||at.type!=="web") return;
  const engine = S.settings.translateEngine||"google";
  const target = S.settings.translateTargetLang||S.settings.language||"tr";
  let url;
  if (engine==="deepl") url="https://www.deepl.com/translator#auto/"+target+"/"+encodeURIComponent(at.url);
  else if (engine==="libretranslate") { const base=(S.settings.libreTranslateUrl||"https://libretranslate.com").replace(/\/$/,""); url=base+"/?source=auto&target="+target+"&q="+encodeURIComponent(at.url); }
  else url="https://translate.google.com/translate?sl=auto&tl="+target+"&u="+encodeURIComponent(at.url);
  openWebTab(url,{activate:true});
  closeToolsMenu();
  showToast("Çeviri açılıyor ("+engine+")…");
}

// ── Sayfa araçları ──────────────────────────────────────────────
function showReadingTime() {
  const at = getActiveTab(); if (!at?.webview||at.type!=="web") return;
  at.webview.executeJavaScript(`(function(){const w=(document.body?.innerText||"").trim().split(/\\s+/).filter(Boolean).length;return{w,m:Math.max(1,Math.round(w/200))};})()`)
    .then(r=>{if(r?.w)showToast(`~${r.m} dk okuma · ${r.w.toLocaleString("tr-TR")} kelime`);}).catch(()=>{});
}

function printPage() {
  const at = getActiveTab(); if (!at?.webview||at.type!=="web") return;
  try { at.webview.print(); } catch(_) { at.webview.executeJavaScript("window.print()").catch(()=>{}); }
  closeToolsMenu();
}

function viewPageSource() {
  const at = getActiveTab(); if (!at?.url||at.type!=="web") return;
  openWebTab("view-source:"+at.url,{activate:true}); closeToolsMenu();
}

// ── Sekme arama (Ctrl+Shift+A) ──────────────────────────────────
let _tabSearchEl = null;

function openTabSearch() {
  if (_tabSearchEl) { _tabSearchEl.remove(); _tabSearchEl=null; return; }
  const overlay = document.createElement("div"); _tabSearchEl = overlay;
  overlay.style.cssText = "position:fixed;inset:0;z-index:100001;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;background:rgba(0,0,0,.35);backdrop-filter:blur(4px)";
  const box = document.createElement("div");
  box.style.cssText = "width:min(500px,90vw);background:var(--panel);border:1px solid var(--line-mid);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden";
  const inp = document.createElement("input"); inp.type="text"; inp.placeholder="Sekme ara… (başlık veya URL)"; inp.autocomplete="off";
  inp.style.cssText = "width:100%;height:52px;padding:0 18px;border:0;border-bottom:1px solid var(--line-mid);background:transparent;color:var(--text);font-size:14.5px;outline:none;box-sizing:border-box";
  const list = document.createElement("div"); list.style.cssText = "max-height:360px;overflow-y:auto";
  box.append(inp,list); overlay.appendChild(box); document.body.appendChild(overlay);
  function render(q) {
    list.innerHTML = "";
    const lq = q.toLowerCase().trim();
    const tabs = S.tabs.filter(t=>!lq||(t.title||"").toLowerCase().includes(lq)||(t.url||"").toLowerCase().includes(lq));
    if (!tabs.length) { list.innerHTML='<div style="padding:20px;text-align:center;font-size:13px;color:var(--text-2)">Sekme bulunamadı</div>'; return; }
    tabs.forEach((tab,i) => {
      const row = document.createElement("button");
      row.style.cssText = "display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;border:0;background:"+(i===0?"var(--accent-soft)":"transparent")+";color:var(--text);font-size:13px;cursor:pointer;text-align:left;box-sizing:border-box";
      row.type = "button";
      const fu = tab.favicon||(tab.type==="web"?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tab.url||"https://x").origin)}&sz=16`:"");
      const badges = [tab.id===S.activeTabId?"Aktif":"",tab.sleeping?"Uyuyor":"",tab.audible?"♪":"",tab.locked?"🔒":"",tab.incognito?"Gizli":"",tab.pinned?"Sabitli":""].filter(Boolean);
      row.innerHTML = `${fu?`<img src="${fu}" width="14" height="14" style="border-radius:3px;flex-shrink:0" onerror="this.remove()">`:''}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tab.title||tab.url||"Yeni Sekme"}</span>${badges.map(b=>`<span style="font-size:10px;background:var(--panel-soft);color:var(--text-2);padding:1px 5px;border-radius:4px;flex-shrink:0">${b}</span>`).join("")}<span style="font-size:10.5px;color:var(--text-2);flex-shrink:0">${S.tabs.indexOf(tab)+1}. sekme</span>`;
      row.onmouseover = () => { list.querySelectorAll("button").forEach(b=>b.style.background="transparent"); row.style.background="var(--accent-soft)"; };
      row.addEventListener("click", ()=>{ activateTab(tab.id); _tabSearchEl?.remove(); _tabSearchEl=null; });
      list.appendChild(row);
    });
  }
  inp.addEventListener("input", ()=>render(inp.value));
  inp.addEventListener("keydown", e=>{
    const rows=list.querySelectorAll("button");
    const idx=Array.from(rows).findIndex(r=>r.style.background.includes("accent-soft"));
    if(e.key==="ArrowDown"){e.preventDefault();const n=rows[Math.min(idx+1,rows.length-1)];if(n){rows.forEach(r=>r.style.background="transparent");n.style.background="var(--accent-soft)";n.scrollIntoView({block:"nearest"});}}
    if(e.key==="ArrowUp"){e.preventDefault();const p=rows[Math.max(idx-1,0)];if(p){rows.forEach(r=>r.style.background="transparent");p.style.background="var(--accent-soft)";p.scrollIntoView({block:"nearest"});}}
    if(e.key==="Enter"){list.querySelector('button[style*="accent-soft"]')?.click();}
    if(e.key==="Escape"){_tabSearchEl?.remove();_tabSearchEl=null;}
  });
  overlay.addEventListener("click",e=>{if(e.target===overlay){_tabSearchEl?.remove();_tabSearchEl=null;}});
  render(""); setTimeout(()=>inp.focus(),20);
}

// ── Sekme kilitleme ─────────────────────────────────────────────
function lockTab(tabId) {
  const tab = S.tabs.find(t=>t.id===(tabId||S.activeTabId)); if (!tab) return;
  tab.locked = !tab.locked;
  renderTabs();
  showToast(tab.locked?"Sekme kilitlendi — yanlışlıkla kapatılamaz":"Sekme kilidi kaldırıldı");
  persistSoon();
}

// closeTab'ı kilitli sekme için koru
setTimeout(()=>{
  const _origClose = window.closeTab || (typeof closeTab === "function" ? closeTab : null);
  if (!_origClose) return;
  window.closeTab = function(tabId) {
    const tab = S.tabs.find(t=>t.id===tabId);
    if (tab?.locked) { showToast("Sekme kilitli — önce kilidi kaldır (Ctrl+Shift+L)"); return; }
    _origClose(tabId);
  };
}, 600);

// ── Sürükle-bırak sekme sıralama ───────────────────────────────
function initTabDragSort() {
  const bar = document.getElementById("tabs-bar");
  if (!bar) { setTimeout(initTabDragSort,500); return; }
  let dragSrcId = null;
  bar.addEventListener("dragstart", e=>{
    const card=e.target.closest(".tab-card"); if(!card)return;
    dragSrcId=card.dataset.tabId;
    card.style.opacity="0.45";
    card.style.transform="scale(.95) rotate(-1deg)";
    card.style.transition="opacity 100ms, transform 100ms";
    e.dataTransfer.effectAllowed="move";
  });
  bar.addEventListener("dragend", e=>{
    const card=e.target.closest(".tab-card");
    if(card){card.style.opacity="";card.style.transform="";card.style.transition="";}
    bar.querySelectorAll(".tab-card").forEach(c=>{c.style.outline="";c.style.transform="";});
    dragSrcId=null;
  });
  bar.addEventListener("dragover", e=>{
    e.preventDefault(); e.dataTransfer.dropEffect="move";
    const card=e.target.closest(".tab-card"); if(!card||card.dataset.tabId===dragSrcId)return;
    bar.querySelectorAll(".tab-card").forEach(c=>{c.style.outline="";c.style.transform=c.dataset.tabId===dragSrcId?"scale(.95) rotate(-1deg)":"";});
    card.style.outline="2px solid var(--accent)";
    card.style.transform="scale(1.04)";
  });
  bar.addEventListener("drop", e=>{
    e.preventDefault();
    const targetCard=e.target.closest(".tab-card"); if(!targetCard||!dragSrcId||targetCard.dataset.tabId===dragSrcId)return;
    const si=S.tabs.findIndex(t=>t.id===dragSrcId), di=S.tabs.findIndex(t=>t.id===targetCard.dataset.tabId);
    if(si<0||di<0)return;
    const [moved]=S.tabs.splice(si,1); S.tabs.splice(di,0,moved);
    renderTabs(); persistSoon();
    bar.querySelectorAll(".tab-card").forEach(c=>c.style.outline=""); dragSrcId=null;
  });
  const enableDrag=()=>bar.querySelectorAll(".tab-card:not([draggable])").forEach(c=>c.setAttribute("draggable","true"));
  enableDrag();
  new MutationObserver(enableDrag).observe(bar,{childList:true});
}

// ── Sekme sayısı badge ──────────────────────────────────────────
function updateTabCountBadge() {
  let badge = document.getElementById("_tab_count_badge");
  const count = S.tabs?.length||0;
  if (count<8) { badge?.remove(); return; }
  if (!badge) {
    badge=document.createElement("div"); badge.id="_tab_count_badge";
    badge.style.cssText="position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line-mid);border-radius:20px;padding:4px 12px;font-size:11.5px;color:var(--text-2);z-index:9000;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.1)";
    document.body.appendChild(badge);
  }
  badge.textContent = count+" sekme açık";
}

// ── Sekme Grid Görünümü (Genel Bakış) ───────────────────────────
let _tabGridOpen = false;
function toggleTabGrid() {
  const stack = document.getElementById("webview-stack");
  if (!stack) return;
  _tabGridOpen = !_tabGridOpen;
  
  if (_tabGridOpen) {
    stack.style.display = "flex";
    stack.style.flexWrap = "wrap";
    stack.style.gap = "20px";
    stack.style.padding = "20px";
    stack.style.background = "var(--panel-soft)";
    stack.style.overflowY = "auto";
    
    Array.from(stack.children).forEach(wv => {
      const tabId = wv.dataset.tabId;
      const tab = S.tabs.find(t=>t.id===tabId);
      if(!tab)return;
      
      wv.style.position = "relative";
      wv.style.flex = "0 0 min(480px, 40%)";
      wv.style.height = "280px";
      wv.style.borderRadius = "12px";
      wv.style.boxShadow = "0 10px 30px rgba(0,0,0,0.15)";
      wv.style.transition = "transform 300ms, box-shadow 300ms";
      wv.style.overflow = "hidden";
      wv.style.pointerEvents = "none"; // webview click'i devre disi birak
      
      let over = document.getElementById("grid-overlay-" + tabId);
      if (!over) {
        over = document.createElement("div");
        over.id = "grid-overlay-" + tabId;
        over.style.cssText = "position:absolute;inset:0;z-index:9000;cursor:pointer;background:rgba(0,0,0,0.02);display:flex;flex-direction:column;justify-content:space-between;border-radius:12px;border:1px solid var(--line-mid)";
        
        // Üst panel (favicon, title)
        const hdr = document.createElement("div");
        hdr.style.cssText = "padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--line-mid);display:flex;align-items:center;gap:6px";
        const fu = tab.favicon||(tab.type==="web"?faviconUrl(tab.url):"");
        if (fu) { const fi = document.createElement("img"); fi.src=fu; fi.width=16; fi.height=16; fi.style.borderRadius="3px"; hdr.appendChild(fi); }
        hdr.innerHTML += `<span style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${tab.title||tab.url||"Yeni Sekme"}</span>`;
        // Kapat butonu
        const clsB = document.createElement("button");
        clsB.innerHTML = "✕";
        clsB.style.cssText = "background:0;border:0;color:var(--text-2);cursor:pointer;font-size:14px;pointer-events:auto;z-index:9001";
        clsB.onclick = (e) => { e.stopPropagation(); closeTab(tabId); setTimeout(()=>{if(_tabGridOpen){_tabGridOpen=false;toggleTabGrid();}},50); };
        hdr.appendChild(clsB);
        over.appendChild(hdr);
        
        over.onmouseover = () => { wv.style.transform="scale(1.02);"; wv.style.boxShadow="0 15px 40px rgba(0,0,0,0.2)"; over.style.background="transparent"; };
        over.onmouseout  = () => { wv.style.transform=""; wv.style.boxShadow="0 10px 30px rgba(0,0,0,0.15)"; over.style.background="rgba(0,0,0,0.02)"; };
        over.onclick = () => { toggleTabGrid(); activateTab(tabId); };
        
        wv.appendChild(over);
      }
    });
  } else {
    // Un-grid
    stack.style.display = "";
    stack.style.flexWrap = "";
    stack.style.gap = "";
    stack.style.padding = "";
    stack.style.background = "";
    stack.style.overflowY = "";
    
    Array.from(stack.children).forEach(wv => {
      wv.style.position = "";
      wv.style.flex = "";
      wv.style.height = "100%";
      wv.style.transform = "";
      wv.style.borderRadius = "";
      wv.style.boxShadow = "";
      wv.style.transition = "";
      wv.style.pointerEvents = "auto";
      
      document.getElementById("grid-overlay-" + wv.dataset.tabId)?.remove();
    });
  }
}

// ── Klavye kısayolları ──────────────────────────────────────────
window.addEventListener("keydown", e=>{
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="g"){e.preventDefault();toggleTabGrid();}
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="s"){e.preventDefault();takeScreenshot();}
  if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==="b"){e.preventDefault();toggleSidePanel();}
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="a"){e.preventDefault();openTabSearch();}
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="l"){e.preventDefault();lockTab();}
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="r"){e.preventDefault();if(typeof toggleResearchPanel==="function")toggleResearchPanel();}
  if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==="u"){e.preventDefault();viewPageSource();}
  if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==="p"){e.preventDefault();printPage();}
},false);

// ── Init ────────────────────────────────────────────────────────
setTimeout(()=>{
  initTabHoverPreview();
  initTabDragSort();
  const bar=document.getElementById("tabs-bar");
  if(bar)new MutationObserver(()=>updateTabCountBadge()).observe(bar,{childList:true});
},300);
