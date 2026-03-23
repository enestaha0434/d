"use strict";
// ═══════════════════════════════════════════════════════════════
// ui_command.js — Command Bar (Ctrl+K) + Split View
// ═══════════════════════════════════════════════════════════════

let _cmdBarOpen = false;

function openCommandBar() {
  if (_cmdBarOpen) { closeCommandBar(); return; }
  _cmdBarOpen = true;
  const overlay = document.createElement("div");
  overlay.id = "_cmd_overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding-top:72px;background:rgba(0,0,0,.32);backdrop-filter:blur(3px)";
  const box = document.createElement("div");
  box.style.cssText = "width:min(580px,90vw);background:var(--panel);border:1px solid var(--line-mid);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden";
  const style = document.createElement("style"); style.id = "_cmd_style";
  style.textContent = [
    "#_cmd_input{width:100%;height:50px;padding:0 18px;border:0;border-bottom:1px solid var(--line-mid);background:transparent;color:var(--text);font-size:14.5px;outline:none;box-sizing:border-box}",
    "#_cmd_input::placeholder{color:var(--text-2)}",
    "._cmd_list{max-height:320px;overflow-y:auto}",
    "._cmd_item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 14px;border:0;background:transparent;color:var(--text);font-size:13px;cursor:pointer;text-align:left;transition:background 60ms}",
    "._cmd_item:hover,._cmd_item.selected{background:var(--accent-soft)}",
    "._cmd_item:hover .cmd-label,._cmd_item.selected .cmd-label{color:var(--accent)}",
    "._cmd_icon{font-size:15px;width:20px;text-align:center;flex-shrink:0;opacity:.7}",
    "._cmd_label{flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "._cmd_sub{font-size:11px;color:var(--text-2);flex-shrink:0;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "._cmd_empty{padding:20px;text-align:center;color:var(--text-2);font-size:13px}",
    "._cmd_list::-webkit-scrollbar{width:4px}",
    "._cmd_list::-webkit-scrollbar-thumb{background:var(--line-mid);border-radius:3px}",
  ].join("");
  document.head.appendChild(style);
  const input = document.createElement("input");
  input.id = "_cmd_input"; input.type = "text";
  input.placeholder = "Sekme, yer imi, komut ara… (Esc ile kapat)";
  input.autocomplete = "off";
  const list = document.createElement("div"); list.className = "_cmd_list";
  box.appendChild(input); box.appendChild(list);
  overlay.appendChild(box); document.body.appendChild(overlay);
  let _sel = 0, _items = [];
  function _buildItems(q) {
    q = q.toLowerCase().trim();
    const items = [];
    S.tabs.forEach(tab => {
      const t = (tab.title||tab.url||"").toLowerCase(), u = (tab.url||"").toLowerCase();
      if (!q || t.includes(q) || u.includes(q))
        items.push({icon:"📄", label:tab.title||tab.url||"Sekme", sub:tab.id===S.activeTabId?"Aktif":"", action:()=>{activateTab(tab.id);closeCommandBar();}});
    });
    if (q && S.bookmarks) S.bookmarks.slice(0,100).forEach(bm => {
      if ((bm.title||"").toLowerCase().includes(q)||(bm.url||"").toLowerCase().includes(q))
        items.push({icon:"⭐", label:bm.title||bm.url, sub:bm.url.replace(/^https?:\/\//,"").slice(0,40), action:()=>{navigateCurrent(bm.url);closeCommandBar();}});
    });
    [{icon:"⚙️",label:"Ayarlar",sub:"Ctrl+,",page:"settings"},{icon:"📜",label:"Geçmiş",sub:"Ctrl+H",page:"history"},
     {icon:"📥",label:"İndirmeler",sub:"Ctrl+J",page:"downloads"},{icon:"🏠",label:"Karşılama",sub:"",page:"welcome"},
     {icon:"ℹ️",label:"Hakkında",sub:"",page:"about"}].forEach(p => {
      if (!q||p.label.toLowerCase().includes(q)) items.push({...p,action:()=>{openInternal(p.page);closeCommandBar();}});
    });
    [{icon:"➕",label:"Yeni sekme",sub:"Ctrl+T",action:()=>{closeCommandBar();openNewTab();}},
     {icon:"🔒",label:"Gizli sekme",sub:"Ctrl+Shift+N",action:()=>{closeCommandBar();openNewTab(true);}},
     {icon:"🔍",label:"Sayfada ara",sub:"Ctrl+F",action:()=>{closeCommandBar();setTimeout(()=>openFind(),80);}},
     {icon:"❌",label:"Aktif sekmeyi kapat",sub:"Ctrl+W",action:()=>{closeCommandBar();if(S.activeTabId)closeTab(S.activeTabId);}},
     {icon:"📸",label:"Ekran görüntüsü",sub:"Ctrl+Shift+S",action:()=>{closeCommandBar();setTimeout(()=>takeScreenshot(),80);}},
     {icon:"📖",label:"Okuma modu",sub:"",action:()=>{closeCommandBar();setTimeout(()=>toggleReader(),80);}},
     {icon:"🤖",label:"Süper Özetle (AI)",sub:"Sayfa içeriğini özetler",action:()=>{closeCommandBar();if(window.toggleResearchPanel)toggleResearchPanel();}},
     {icon:"🧳",label:"Yeni Kapsayıcı Sekmesi (Zen Sandbox)",sub:"Tam izole, çerezsiz oturum başlat",action:()=>{
        closeCommandBar(); 
        const cName = prompt("Kapsayıcı adı (Örn: Is, Gizli, Profil 2):", "Kisisel"); 
        if(cName) {
           openWebTab(getEngine().home||"https://www.google.com", {activate:true, containerId: cName.trim()});
           showToast(`Kapsayıcı sekmesi açıldı: ${cName}`, 4000, "success");
        }
     }},
     {icon:"🧅",label:"Tor Proxy Aç/Kapat",sub:"Gizlilik & Güvenlik",action:()=>{closeCommandBar();if(window.B)B.saveStore({settings:{...S.settings,torEnabled:!S.settings.torEnabled}}); showToast(`Tor Proxy ${S.settings.torEnabled?'Kapatılacak':'Açılacak'} (Ayarlar güncellendi)`);}},
     {icon:"🎨",label:"Tema Menüsü",sub:"Kişiselleştir",action:()=>{closeCommandBar();setTimeout(()=>toggleThemeEditor(),80);}},
     {icon:"🌙",label:"Gece/Gündüz Modu Değiştir",sub:"Pratik Kısayol",action:()=>{closeCommandBar();S.settings.theme=S.settings.theme==='night'?'mist':'night'; applyTheme(); persistSoon(); showToast("Tema değiştirildi");}},
     {icon:"📋",label:"Yan panel",sub:"Ctrl+B",action:()=>{closeCommandBar();toggleSidePanel();}},
     {icon:"🔑",label:"Şifre yöneticisi",sub:"",action:()=>{closeCommandBar();togglePwPanel();}},
     {icon:"📝",label:"Serbest Notlar",sub:"Ctrl+Shift+R",action:()=>{closeCommandBar();toggleNotes();}},
     {icon:"🔎",label:"Açık Sekmeler İçinde Ara",sub:"Ctrl+Shift+A",action:()=>{closeCommandBar();openTabSearch();}},
    ].forEach(c => { if (!q||c.label.toLowerCase().includes(q)) items.push(c); });
    if (q) {
      if (q.includes(".")||/^https?:\/\//.test(q)) {
        const url=/^https?:\/\//.test(q)?q:"https://"+q;
        items.push({icon:"🌐",label:`"${q}" adresine git`,sub:url,action:()=>{navigateCurrent(normalizeInput(url));closeCommandBar();}});
      }
      items.push({icon:"🔎",label:`"${q}" ara`,sub:"Varsayılan arama motoru",action:()=>{navigateCurrent(normalizeInput(q));closeCommandBar();}});
    }
    return items.slice(0,16);
  }
  function _render(q) {
    _items = _buildItems(q); _sel = 0; list.innerHTML = "";
    if (!_items.length) { list.innerHTML='<div class="_cmd_empty">Sonuç yok</div>'; return; }
    _items.forEach((item,i) => {
      const row = document.createElement("button"); row.className = "_cmd_item"+(i===0?" selected":""); row.type = "button";
      row.innerHTML = `<span class="_cmd_icon">${item.icon}</span><span class="_cmd_label">${item.label}</span><span class="_cmd_sub">${item.sub||""}</span>`;
      row.addEventListener("click", item.action);
      row.addEventListener("mouseenter", () => { list.querySelectorAll("._cmd_item").forEach(r=>r.classList.remove("selected")); row.classList.add("selected"); _sel=i; });
      list.appendChild(row);
    });
  }
  function _updateSel() {
    const rows = list.querySelectorAll("._cmd_item");
    rows.forEach((r,i)=>r.classList.toggle("selected",i===_sel));
    rows[_sel]?.scrollIntoView({block:"nearest"});
  }
  input.addEventListener("input", ()=>_render(input.value));
  input.addEventListener("keydown", e => {
    if(e.key==="ArrowDown"){e.preventDefault();_sel=Math.min(_sel+1,_items.length-1);_updateSel();}
    if(e.key==="ArrowUp"){e.preventDefault();_sel=Math.max(_sel-1,0);_updateSel();}
    if(e.key==="Enter"){e.preventDefault();_items[_sel]?.action();}
    if(e.key==="Escape"){closeCommandBar();}
  });
  overlay.addEventListener("click", e=>{if(e.target===overlay)closeCommandBar();});
  _render(""); setTimeout(()=>input.focus(),20);
}

function closeCommandBar() {
  _cmdBarOpen = false;
  document.getElementById("_cmd_overlay")?.remove();
  document.getElementById("_cmd_style")?.remove();
}

// ── Split View ──────────────────────────────────────────────────────────────
let _splitActive = false, _splitSecondTabId = null;

function toggleSplitView() {
  closeToolsMenu();
  if (_splitActive) { closeSplitView(); return; }
  const at = getActiveTab();
  if (!at||at.type!=="web") { showToast("Split view sadece web sayfalarında çalışır"); return; }
  const otherTabs = S.tabs.filter(t=>t.id!==at.id&&t.type==="web");
  if (!otherTabs.length) { showToast("Başka web sekmesi yok — önce yeni sekme aç"); return; }
  const overlay = document.createElement("div"); overlay.id = "_split_picker";
  overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.32);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center";
  const box = document.createElement("div");
  box.style.cssText = "background:var(--panel);border:1px solid var(--line-mid);border-radius:14px;padding:18px;width:min(380px,90vw);box-shadow:0 16px 48px rgba(0,0,0,.25)";
  box.innerHTML = '<div style="font-size:13.5px;font-weight:600;margin-bottom:12px;color:var(--text)">Split view — ikinci sekmeyi seç</div><div id="_split_list" style="display:flex;flex-direction:column;gap:4px;max-height:280px;overflow-y:auto"></div><div style="margin-top:12px;display:flex;justify-content:flex-end"><button id="_split_cancel" style="padding:6px 14px;border-radius:8px;border:1px solid var(--line-mid);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:12.5px">İptal</button></div>';
  otherTabs.forEach(tab => {
    const btn = document.createElement("button");
    btn.style.cssText = "display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;border:1px solid var(--line-mid);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:12.5px;text-align:left;width:100%;transition:background 80ms";
    btn.innerHTML = `<span style="font-size:14px">📄</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tab.title||tab.url}</span>`;
    btn.addEventListener("mouseover",()=>btn.style.background="var(--accent-soft)");
    btn.addEventListener("mouseout",()=>btn.style.background="var(--panel-soft)");
    btn.addEventListener("click",()=>{overlay.remove();_activateSplitView(at.id,tab.id);});
    box.querySelector("#_split_list").appendChild(btn);
  });
  box.querySelector("#_split_cancel").addEventListener("click",()=>overlay.remove());
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove();});
  overlay.appendChild(box); document.body.appendChild(overlay);
}

function _activateSplitView(tab1Id, tab2Id) {
  _splitActive = true; _splitSecondTabId = tab2Id;
  const shell = document.querySelector(".view-shell");
  const stack = document.getElementById("webview-stack");
  if (!shell || !stack) return;
  
  const tab1 = S.tabs.find(t=>t.id===tab1Id);
  const tab2 = S.tabs.find(t=>t.id===tab2Id);
  if (!tab1?.webview || !tab2?.webview) { closeSplitView(); return; }

  // İkinci webview'ı görünür yap
  tab2.webview.classList.add("is-split", "is-active");
  
  // Flex layout ile yan yana diz
  stack.style.display = "flex";
  stack.style.flexDirection = "row";
  
  tab1.webview.style.flex = "1";
  tab1.webview.style.width = "50%";
  tab1.webview.style.minWidth = "0";
  tab1.webview.style.position = "relative";
  
  tab2.webview.style.flex = "1";
  tab2.webview.style.width = "50%";
  tab2.webview.style.minWidth = "0";
  tab2.webview.style.position = "relative";
  tab2.webview.style.borderLeft = "1px solid var(--line-mid)";
  
  // Kapatma butonu ekle
  const cb = document.createElement("button");
  cb.id = "_split_close_btn";
  cb.innerHTML = "Split View'ı Kapat ✕";
  cb.style.cssText = "position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:99999; background:var(--panel); border:1px solid var(--line-mid); color:var(--text); padding:6px 14px; border-radius:8px; font-size:12px; cursor:pointer; font-weight:600; box-shadow:0 4px 14px rgba(0,0,0,0.2)";
  cb.addEventListener("click", closeSplitView);
  
  document.body.appendChild(cb);
  showToast("Split view açıldı");
}

function closeSplitView() {
  _splitActive = false;
  const stack = document.getElementById("webview-stack");
  document.getElementById("_split_close_btn")?.remove();
  
  if (stack) {
    stack.style.display = "";
    stack.style.flexDirection = "";
  }
  
  const tab2 = S.tabs.find(t=>t.id===_splitSecondTabId);
  if (tab2?.webview) {
    tab2.webview.classList.remove("is-split", "is-active");
    tab2.webview.style.flex = "";
    tab2.webview.style.width = "";
    tab2.webview.style.minWidth = "";
    tab2.webview.style.position = "";
    tab2.webview.style.borderLeft = "";
  }
  
  const tab1 = getActiveTab();
  if (tab1?.webview) {
    tab1.webview.style.flex = "";
    tab1.webview.style.width = "";
    tab1.webview.style.minWidth = "";
    tab1.webview.style.position = "";
    tab1.webview.style.borderLeft = "";
    tab1.webview.classList.add("is-active");
  }
  
  _splitSecondTabId = null;
}
