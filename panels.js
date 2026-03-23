"use strict";
// panels.js — Araçlar menüsü, yan panel, oturum, şifre, çerez, sticky, mail
// ═══════════════════════════════════════════════════════════════════════════
// ARAÇLAR MENÜSÜ (üç nokta)
// ═══════════════════════════════════════════════════════════════════════════
let _toolsOpen=false;
function closeToolsMenu(){
  _toolsOpen=false;
  const p=document.getElementById("tools-menu-popup");
  if(!p)return;
  p.style.opacity="0";
  p.style.transform="scale(.95) translateY(-6px)";
  p.style.pointerEvents="none";
  setTimeout(()=>{ if(!_toolsOpen) p.style.display="none"; }, 150);
}
function toggleToolsMenu(e){
  e?.stopPropagation();
  const p=document.getElementById("tools-menu-popup");
  const btn=document.getElementById("tools-menu-btn");
  if(!p||!btn)return;
  _toolsOpen=!_toolsOpen;
  if(_toolsOpen){
    const rect=btn.getBoundingClientRect();
    // display:block + removeProperty override garantisi
    p.style.cssText=""; // tüm inline stilleri temizle
    p.style.display="block";
    p.style.visibility="visible";
    p.style.position="fixed";
    p.style.top=(rect.bottom+6)+"px";
    p.style.right=(window.innerWidth-rect.right)+"px";
    p.style.left="auto";
    p.style.zIndex="2147483647";
    p.style.opacity="0";
    p.style.transform="scale(.95) translateY(-6px)";
    p.style.pointerEvents="";
    p.style.transition="opacity 140ms cubic-bezier(.32,.72,0,1), transform 160ms cubic-bezier(.34,1.56,.64,1)";
    // Web-only bölüm
    const at=getActiveTab();
    const webSec=document.getElementById("tools-web-section");
    if(webSec)webSec.style.display=at?.type==="web"?"block":"none";
    // Animate in
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      p.style.opacity="1";
      p.style.transform="scale(1) translateY(0)";
    }));
    // Menü öğeleri staggered
    requestAnimationFrame(()=>{
      p.querySelectorAll(".tools-menu-item").forEach((item,i)=>{
        item.style.opacity="0";
        item.style.transform="translateX(-5px)";
        item.style.transition="opacity 100ms, transform 120ms cubic-bezier(.34,1.56,.64,1)";
        setTimeout(()=>{item.style.opacity="";item.style.transform="";},i*18+80);
      });
    });
  } else {
    closeToolsMenu();
  }
}
document.addEventListener("click",e=>{
  if(_toolsOpen&&!e.target.closest("#tools-menu-popup")&&!e.target.closest("#tools-menu-btn"))closeToolsMenu();
});

// ═══════════════════════════════════════════════════════════════════════════
// YAN PANEL — soldan açılır
// ═══════════════════════════════════════════════════════════════════════════
let _spEl=null, _spTab="todo";
function _todosGet(){try{return JSON.parse(sessionStorage.getItem("_ill_todos")||"[]");}catch(_){return[];}}
function _todosSave(a){try{sessionStorage.setItem("_ill_todos",JSON.stringify(a));}catch(_){}}

function toggleSidePanel(){
  closeToolsMenu();
  if(_spEl){_spEl.remove();_spEl=null;return;}
  const p=document.createElement("div");_spEl=p;
  // SOL TARAFTAN açılır
  p.style.cssText="position:fixed;top:0;left:0;width:280px;height:100vh;background:var(--panel);border-right:1px solid var(--line-mid);box-shadow:4px 0 20px rgba(0,0,0,.1);z-index:9990;display:flex;flex-direction:column;animation:slideInLeft 160ms ease";

  // Animasyon stil
  if(!document.getElementById("_sp_anim")){
    const s=document.createElement("style");s.id="_sp_anim";
    s.textContent="@keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}";
    document.head.appendChild(s);
  }

  const TABS=[{id:"todo",lbl:"Görev"},{id:"clip",lbl:"Pano"},{id:"notes",lbl:"Not"},{id:"media",lbl:"Medya"}];
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;padding:10px 8px 0;border-bottom:1px solid var(--line);flex-shrink:0;gap:2px";
  const tbBtns={};
  TABS.forEach(t=>{
    const b=document.createElement("button");b.type="button";b.textContent=t.lbl;
    b.style.cssText=`padding:5px 10px;border:0;border-radius:6px;cursor:pointer;font-size:11.5px;background:${t.id===_spTab?"var(--accent)":"transparent"};color:${t.id===_spTab?"var(--accent-ink,#fff)":"var(--text-2)"};font-weight:${t.id===_spTab?"600":"400"};transition:background 120ms`;
    b.addEventListener("click",()=>{
      _spTab=t.id;
      TABS.forEach(x=>{tbBtns[x.id].style.background=x.id===t.id?"var(--accent)":"transparent";tbBtns[x.id].style.color=x.id===t.id?"var(--accent-ink,#fff)":"var(--text-2)";tbBtns[x.id].style.fontWeight=x.id===t.id?"600":"400";});
      renderSpBody(body);
    });
    tbBtns[t.id]=b;hdr.appendChild(b);
  });
  const cls=document.createElement("button");
  cls.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls.style.cssText="margin-left:auto;border:0;background:0;cursor:pointer;color:var(--text-2);padding:4px;border-radius:5px;display:flex";
  cls.addEventListener("click",toggleSidePanel);hdr.appendChild(cls);p.appendChild(hdr);
  const body=document.createElement("div");body.style.cssText="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px";
  p.appendChild(body);document.body.appendChild(p);
  renderSpBody(body);
}

function renderSpBody(body){
  body.innerHTML="";
  if(_spTab==="todo")renderSpTodo(body);
  else if(_spTab==="clip")renderSpClip(body);
  else if(_spTab==="notes")renderSpNotes(body);
  else if(_spTab==="media")renderSpMedia(body);
}

function renderSpTodo(body){
  const todos=_todosGet();
  const row=document.createElement("div");row.style.cssText="display:flex;gap:6px";
  const inp=document.createElement("input");inp.type="text";inp.placeholder="Yeni görev…";
  inp.style.cssText="flex:1;height:30px;padding:0 9px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none";
  const addB=document.createElement("button");addB.textContent="+";
  addB.style.cssText="width:30px;height:30px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:18px;line-height:1";
  const doAdd=()=>{const t=inp.value.trim();if(!t)return;todos.unshift({id:Date.now(),text:t,done:false});_todosSave(todos);inp.value="";renderSpTodo(body);};
  inp.addEventListener("keydown",e=>e.key==="Enter"&&doAdd());addB.addEventListener("click",doAdd);row.append(inp,addB);body.appendChild(row);
  if(!todos.length){const em=document.createElement("div");em.style.cssText="font-size:12px;color:var(--text-2);text-align:center;padding:16px";em.textContent="Görev yok. Yukarıdan ekle.";body.appendChild(em);return;}
  todos.forEach((todo,i)=>{
    const item=document.createElement("div");item.style.cssText="display:flex;align-items:center;gap:7px;padding:6px 8px;background:var(--panel-soft);border-radius:8px";
    const cb=document.createElement("input");cb.type="checkbox";cb.checked=todo.done;cb.style.cssText="cursor:pointer;flex-shrink:0;accent-color:var(--accent)";
    const sp=document.createElement("span");sp.textContent=todo.text;sp.style.cssText=`flex:1;font-size:12.5px;color:var(--text)${todo.done?";text-decoration:line-through;opacity:.5":""}`;
    cb.addEventListener("change",()=>{todos[i].done=cb.checked;_todosSave(todos);sp.style.textDecoration=cb.checked?"line-through":"none";sp.style.opacity=cb.checked?".5":"1";});
    const del=document.createElement("button");del.innerHTML='<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    del.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:2px;display:flex;border-radius:4px;flex-shrink:0";
    del.addEventListener("click",()=>{todos.splice(i,1);_todosSave(todos);renderSpTodo(body);});
    item.append(cb,sp,del);body.appendChild(item);
  });
}

async function renderSpClip(body){
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
  const tl=document.createElement("span");tl.style.cssText="font-size:11.5px;font-weight:600;color:var(--text-2)";tl.textContent="Pano geçmişi";
  const clr=document.createElement("button");clr.textContent="Temizle";clr.style.cssText="padding:2px 7px;border:1px solid var(--line-mid);border-radius:5px;background:0;cursor:pointer;font-size:11px;color:var(--text-2)";
  clr.addEventListener("click",async()=>{try{await B.clearClipboard?.();}catch(_){}renderSpClip(body);});
  hdr.append(tl,clr);body.appendChild(hdr);
  let items=[];try{items=await B.listClipboard?.()||[];}catch(_){}
  if(!items.length){const em=document.createElement("div");em.style.cssText="font-size:12px;color:var(--text-2);text-align:center;padding:16px";em.textContent="Henüz kopyalanan içerik yok.";body.appendChild(em);return;}
  items.forEach(item=>{
    const el=document.createElement("div");el.title=item.text||"";
    el.style.cssText="padding:7px 10px;background:var(--panel-soft);border-radius:7px;cursor:pointer;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid transparent;transition:border-color 100ms";
    el.textContent=(item.text||"").slice(0,120);
    el.onmouseover=()=>el.style.borderColor="var(--accent)";el.onmouseout=()=>el.style.borderColor="transparent";
    el.addEventListener("click",()=>{try{navigator.clipboard.writeText(item.text);}catch(_){}showToast("Kopyalandı");});
    body.appendChild(el);
  });
}

function renderSpNotes(body){
  const ta=document.createElement("textarea");ta.value=S.notes||"";ta.placeholder="Notlarını buraya yaz…";
  ta.style.cssText="flex:1;border:0;background:transparent;color:var(--text);font:13px/1.7 system-ui,sans-serif;outline:none;resize:none;min-height:280px;width:100%";
  ta.addEventListener("input",()=>{S.notes=ta.value;persistSoon();if(ui.notesTa)ui.notesTa.value=ta.value;});
  body.appendChild(ta);
}

function renderSpMedia(body){
  const audible=S.tabs.filter(t=>t.audible||t.muted);
  if(!audible.length){const em=document.createElement("div");em.style.cssText="font-size:12px;color:var(--text-2);text-align:center;padding:20px;line-height:1.7";em.textContent="Şu an ses çalan sekme yok.\nMüzik/video oynatılınca burada görünür.";body.appendChild(em);return;}
  audible.forEach(tab=>{
    const item=document.createElement("div");item.style.cssText="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--panel-soft);border-radius:9px";
    const icon=document.createElement("div");icon.style.cssText="flex-shrink:0;color:var(--accent)";
    icon.innerHTML=tab.muted
      ?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 1.5l11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.5 5v4h2l3 2.5V2.5L7.5 5h-3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'
      :'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 5.5h2.5l3-3v9l-3-3H2V5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 5a2.5 2.5 0 0 1 0 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const info=document.createElement("div");info.style.cssText="flex:1;min-width:0";
    const tEl=document.createElement("div");tEl.style.cssText="font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer";
    tEl.textContent=tab.title||tab.url||"Bilinmeyen";tEl.addEventListener("click",()=>activateTab(tab.id));info.appendChild(tEl);
    const pip=document.createElement("button");
    pip.innerHTML='<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/><rect x="7" y="6" width="5" height="4" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>';
    pip.title="PiP";pip.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;border-radius:5px;display:flex;flex-shrink:0";
    pip.addEventListener("click",()=>{if(!tab.webview)return;tab.webview.executeJavaScript('(()=>{const v=document.querySelector("video");if(v&&document.pictureInPictureEnabled)v.requestPictureInPicture().catch(()=>{});})();').catch(()=>showToast("PiP başlatılamadı"));});
    const muteB=document.createElement("button");
    muteB.innerHTML=tab.muted
      ?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 5.5h2.5l3-3v9l-3-3H2V5.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 5a2.5 2.5 0 0 1 0 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
      :'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 1.5l11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.5 5v4h2l3 2.5V2.5L7.5 5h-3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    muteB.title=tab.muted?"Sesi aç":"Sessize al";muteB.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;border-radius:5px;display:flex;flex-shrink:0";
    muteB.addEventListener("click",()=>{tab.muted=!tab.muted;try{B.audioMute(tab.webview.getWebContentsId(),tab.muted);}catch(_){}renderSpMedia(body);});
    item.append(icon,info,pip,muteB);body.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFİL & OTURUM YÖNETİCİSİ
// ═══════════════════════════════════════════════════════════════════════════
let _sessEl=null;
async function toggleSessionPanel(){
  closeToolsMenu();
  if(_sessEl){document.getElementById("_sbd")?.remove();_sessEl.remove();_sessEl=null;return;}
  const bd=document.createElement("div");bd.id="_sbd";bd.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.3)";document.body.appendChild(bd);
  const p=document.createElement("div");_sessEl=p;
  p.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;width:440px;max-height:82vh;background:var(--panel);border:1px solid var(--line-mid);border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden";
  const close=()=>{document.getElementById("_sbd")?.remove();p.remove();_sessEl=null;};

  // Header + tabs
  const hdr=document.createElement("div");hdr.style.cssText="flex-shrink:0;border-bottom:1px solid var(--line)";
  const topRow=document.createElement("div");topRow.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 0";
  topRow.innerHTML='<span style="font-size:13px;font-weight:700;color:var(--text)">Profil & Oturum Yöneticisi</span>';
  const cls2=document.createElement("button");cls2.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls2.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;display:flex";cls2.addEventListener("click",close);topRow.appendChild(cls2);hdr.appendChild(topRow);

  // Tab bar: Oturumlar | Profiller
  const tabBar=document.createElement("div");tabBar.style.cssText="display:flex;gap:0;padding:0 16px;margin-top:6px";
  let activeManagerTab="sessions";
  const tabBtns={};
  const tabContent=document.createElement("div");tabContent.style.cssText="flex:1;overflow-y:auto;padding:10px";

  ["Oturumlar","Profiller"].forEach((lbl,i)=>{
    const tid=i===0?"sessions":"profiles";
    const b=document.createElement("button");b.type="button";b.textContent=lbl;
    b.style.cssText=`padding:8px 16px;border:0;border-bottom:2px solid ${tid===activeManagerTab?"var(--accent)":"transparent"};background:0;color:${tid===activeManagerTab?"var(--accent)":"var(--text-2)"};cursor:pointer;font-size:12.5px;font-weight:${tid===activeManagerTab?"600":"400"};transition:all 120ms`;
    b.addEventListener("click",()=>{
      activeManagerTab=tid;
      Object.entries(tabBtns).forEach(([k,btn])=>{
        const active=k===tid;
        btn.style.borderBottomColor=active?"var(--accent)":"transparent";
        btn.style.color=active?"var(--accent)":"var(--text-2)";
        btn.style.fontWeight=active?"600":"400";
      });
      renderManagerContent(tabContent,activeManagerTab);
    });
    tabBtns[tid]=b;tabBar.appendChild(b);
  });
  hdr.appendChild(tabBar);p.appendChild(hdr);
  p.appendChild(tabContent);document.body.appendChild(p);
  bd.addEventListener("click",e=>{if(e.target===bd)close();});
  renderManagerContent(tabContent,"sessions");
}

async function renderManagerContent(container,tab){
  container.innerHTML="";
  if(tab==="sessions")await renderSessions(container);
  else renderProfiles(container);
}

async function renderSessions(container){
  // Kaydet alanı
  const sr=document.createElement("div");sr.style.cssText="display:flex;gap:8px;margin-bottom:12px";
  const ni=document.createElement("input");ni.type="text";ni.placeholder=`Oturum ${new Date().toLocaleDateString("tr-TR")}`;
  ni.style.cssText="flex:1;height:32px;padding:0 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12.5px;outline:none";
  const sb=document.createElement("button");sb.textContent="Mevcut sekmeleri kaydet";
  sb.style.cssText="padding:0 12px;height:32px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap";
  sb.addEventListener("click",async()=>{
    const tabs=S.tabs.filter(t=>t.type==="web"&&!t.incognito).map(t=>({url:t.url,title:t.title}));
    if(!tabs.length){showToast("Kaydedilecek web sekmesi yok");return;}
    try{await B.saveSession?.(ni.value.trim()||ni.placeholder,tabs);showToast("Oturum kaydedildi");renderSessions(container);}
    catch(e){showToast("Hata: "+e.message);}
  });
  sr.append(ni,sb);container.appendChild(sr);

  let sessions=[];try{sessions=await B.listSessions?.()||[];}catch(_){}
  if(!sessions.length){const em=document.createElement("div");em.style.cssText="font-size:12px;color:var(--text-2);text-align:center;padding:20px;line-height:1.6";em.textContent="Kayıtlı oturum yok.\nYukarıdaki butonla mevcut sekmeleri kaydet.";container.appendChild(em);return;}
  sessions.forEach(sess=>{
    const item=document.createElement("div");item.style.cssText="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--panel-soft);border-radius:8px;margin-bottom:6px";
    const info=document.createElement("div");info.style.cssText="flex:1;min-width:0";
    info.innerHTML=`<div style="font-size:12.5px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sess.name)}</div><div style="font-size:11px;color:var(--text-2)">${sess.tabs?.length||0} sekme — ${new Date(sess.savedAt).toLocaleDateString("tr-TR")}</div>`;
    const lb=document.createElement("button");lb.title="Yükle";
    lb.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 2v7M3 6.5l3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    lb.style.cssText="border:0;background:var(--accent-soft);color:var(--accent);width:28px;height:28px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0";
    lb.addEventListener("click",()=>{(sess.tabs||[]).forEach(t=>{if(t.url)openWebTab(t.url,{activate:false});});showToast(sess.name+" yüklendi");});
    const db=document.createElement("button");db.title="Sil";
    db.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M4.5 3.5V2h4v1.5M9.5 3.5l-.6 7H4.1l-.6-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    db.style.cssText="border:0;background:0;color:var(--text-2);width:28px;height:28px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0";
    db.addEventListener("click",async()=>{await B.deleteSession?.(sess.id);renderSessions(container);});
    item.append(info,lb,db);container.appendChild(item);
  });
}

function renderProfiles(container){
  // Gerçek IPC profil sistemi (main.js profiles:list)
  container.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-2);text-align:center">Yükleniyor…</div>';
  B.profilesList?.().then(profiles => {
    container.innerHTML = "";
    const nr=document.createElement("div");nr.style.cssText="display:flex;gap:8px;margin-bottom:12px";
    const ni2=document.createElement("input");ni2.type="text";ni2.placeholder="Profil adı (ör: İş, Kişisel)";
    ni2.style.cssText="flex:1;height:32px;padding:0 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12.5px;outline:none";
    const colorPick=document.createElement("input");colorPick.type="color";colorPick.value="#4a90b0";
    colorPick.style.cssText="width:32px;height:32px;border:1px solid var(--line-mid);border-radius:8px;cursor:pointer;padding:2px;background:0";
    const ab=document.createElement("button");ab.textContent="+ Oluştur";
    ab.style.cssText="padding:0 12px;height:32px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap";
    ab.addEventListener("click",async()=>{
      const name=ni2.value.trim();if(!name){showToast("Profil adı girin");return;}
      try{await B.profilesCreate?.({name,color:colorPick.value});showToast("Profil oluşturuldu: "+name);renderProfiles(container);}
      catch(e){showToast("Hata: "+e.message);}
    });
    nr.append(ni2,colorPick,ab);container.appendChild(nr);

    if(!profiles||!profiles.length){
      const em=document.createElement("div");em.style.cssText="font-size:12px;color:var(--text-2);text-align:center;padding:20px;line-height:1.7";
      em.innerHTML="<b>Profil nedir?</b><br>Farklı sekme gruplarını (iş, kişisel, alışveriş vb.) kaydet ve tek tıkla yükle.";
      container.appendChild(em);return;
    }

    B.profilesActive?.().then(activeId => {
      profiles.forEach(prof=>{
        const item=document.createElement("div");item.style.cssText="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--panel-soft);border-radius:8px;margin-bottom:6px;"+(prof.id===activeId?"border:1px solid var(--accent)":"");
        const dot=document.createElement("span");dot.style.cssText=`width:10px;height:10px;border-radius:50%;background:${prof.color||"var(--accent)"};flex-shrink:0`;
        const info=document.createElement("div");info.style.cssText="flex:1;min-width:0";
        info.innerHTML=`<div style="font-size:12.5px;font-weight:600;color:var(--text)">${esc(prof.name)}${prof.id===activeId?'<span style="font-size:10px;color:var(--accent);margin-left:6px">Aktif</span>':""}</div><div style="font-size:11px;color:var(--text-2)">${new Date(prof.createdAt).toLocaleDateString("tr-TR")}</div>`;
        const switchB=document.createElement("button");switchB.title="Geç";
        switchB.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5h9M8 3l3 3.5-3 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        switchB.style.cssText="border:0;background:var(--accent-soft);color:var(--accent);width:28px;height:28px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0";
        switchB.addEventListener("click",async()=>{await B.profilesSwitch?.({id:prof.id});showToast(prof.name+" profiline geçildi");renderProfiles(container);});
        const db=document.createElement("button");db.title="Sil";
        db.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M4.5 3.5V2h4v1.5M9.5 3.5l-.6 7H4.1l-.6-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        db.style.cssText="border:0;background:0;color:var(--text-2);width:28px;height:28px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0";
        db.addEventListener("click",async()=>{
          if(prof.id==="default"){showToast("Varsayılan profil silinemez");return;}
          if(!confirm(`"${prof.name}" profilini sil?`))return;
          await B.profilesDelete?.({id:prof.id});renderProfiles(container);showToast("Profil silindi");
        });
        item.append(dot,info,switchB,db);container.appendChild(item);
      });
    }).catch(()=>{});
  }).catch(()=>{
    container.innerHTML='<div style="padding:12px;font-size:12px;color:#e07040">Profiller yüklenemedi.</div>';
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ŞİFRE YÖNETİCİSİ + OTOMATİK DOLDURMA
// ═══════════════════════════════════════════════════════════════════════════
let _pwEl=null;
function togglePwPanel(){
  closeToolsMenu();
  if(_pwEl){_pwEl.remove();_pwEl=null;return;}
  const p=document.createElement("div");_pwEl=p;
  p.style.cssText="position:fixed;top:0;right:0;width:300px;height:100vh;background:var(--panel);border-left:1px solid var(--line-mid);box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:9993;display:flex;flex-direction:column";
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0";
  hdr.innerHTML='<span style="font-size:13px;font-weight:700;color:var(--text)">Şifre Yöneticisi</span>';
  const cls=document.createElement("button");cls.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;display:flex";cls.addEventListener("click",()=>{p.remove();_pwEl=null;});hdr.appendChild(cls);p.appendChild(hdr);
  const sr=document.createElement("div");sr.style.cssText="display:flex;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line);flex-shrink:0";
  const si=document.createElement("input");si.type="text";si.placeholder="Domain ara…";si.autocomplete="off";
  si.style.cssText="flex:1;height:30px;padding:0 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none";
  const ab=document.createElement("button");ab.textContent="+ Ekle";ab.style.cssText="padding:0 10px;height:30px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap";
  sr.append(si,ab);p.appendChild(sr);
  const listEl=document.createElement("div");listEl.style.cssText="flex:1;overflow-y:auto;padding:8px";p.appendChild(listEl);
  const form=document.createElement("div");form.style.cssText="padding:12px;border-top:1px solid var(--line);flex-shrink:0;display:none";
  const mk=(ph,type="text")=>{const i=document.createElement("input");i.type=type;i.placeholder=ph;i.autocomplete="off";i.style.cssText="display:block;width:100%;height:32px;padding:0 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12.5px;outline:none;margin-bottom:7px;box-sizing:border-box";return i;};
  const fD=mk("Domain (ör: google.com)"),fU=mk("Kullanıcı adı"),fP=mk("Şifre","password"),fL=mk("URL (isteğe bağlı)");
  const fb=document.createElement("div");fb.style.cssText="display:flex;gap:6px";
  const fs=document.createElement("button");fs.textContent="Kaydet";fs.style.cssText="flex:1;height:32px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600";
  const fc=document.createElement("button");fc.textContent="İptal";fc.style.cssText="flex:1;height:32px;border:1px solid var(--line-mid);background:0;color:var(--text-2);border-radius:8px;cursor:pointer;font-size:12.5px";
  fb.append(fs,fc);form.append(fD,fU,fP,fL,fb);p.appendChild(form);
  document.body.appendChild(p);
  const at=getActiveTab();try{if(at?.url)fD.value=new URL(at.url).hostname;}catch(_){}
  ab.addEventListener("click",()=>{form.style.display=form.style.display==="none"?"block":"none";if(form.style.display==="block")fD.focus();});
  fc.addEventListener("click",()=>form.style.display="none");
  fs.addEventListener("click",async()=>{
    const domain=fD.value.trim(),username=fU.value.trim(),password=fP.value;
    if(!domain||!username||!password){showToast("Domain, kullanıcı ve şifre zorunlu");return;}
    try{await B.savePassword?.({id:uid("pw"),domain,username,password,url:fL.value.trim(),savedAt:new Date().toISOString()});form.style.display="none";showToast("Kaydedildi");loadPwList("");}
    catch(e){showToast("Hata: "+e.message);}
  });
  si.addEventListener("input",()=>loadPwList(si.value));loadPwList("");
  async function loadPwList(filter){
    try{
      const items=await B.listPasswords?.()||[];
      const lf=(filter||"").toLowerCase();
      const fil=lf?items.filter(i=>(i.domain||"").toLowerCase().includes(lf)||(i.username||"").toLowerCase().includes(lf)):items;
      if(!fil.length){listEl.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-2)">Kayıtlı şifre yok.<br>+ Ekle butonunu kullan.</div>';return;}
      listEl.innerHTML="";
      fil.forEach(pw=>{
        const item=document.createElement("div");item.style.cssText="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--panel-soft);border-radius:8px;margin-bottom:5px";
        const info=document.createElement("div");info.style.cssText="flex:1;min-width:0";
        info.innerHTML=`<div style="font-size:12.5px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(pw.domain)}</div><div style="font-size:11px;color:var(--text-2)">${esc(pw.username)}</div>`;
        const cpB=document.createElement("button");cpB.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M1 9V2a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
        cpB.title="Şifreyi kopyala";cpB.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:4px;border-radius:5px;display:flex;flex-shrink:0";
        cpB.addEventListener("click",async()=>{const full=await B.getPassword?.(pw.id);if(full?.password){try{await navigator.clipboard.writeText(full.password);}catch(_){}showToast("Şifre kopyalandı");}});
        const dlB=document.createElement("button");dlB.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M4.5 3.5V2h4v1.5M9.5 3.5l-.6 7H4.1l-.6-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        dlB.title="Sil";dlB.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:4px;border-radius:5px;display:flex;flex-shrink:0";
        dlB.addEventListener("click",async()=>{await B.deletePassword?.(pw.id);loadPwList(filter);});
        item.append(info,cpB,dlB);listEl.appendChild(item);
      });
    }catch(e){listEl.innerHTML=`<div style="padding:12px;font-size:12px;color:#e07040">Hata: ${esc(e.message)}</div>`;}
  }
}

async function checkAutoFill(tab){
  if(!tab?.webview||tab.type!=="web")return;
  try{
    const has=await tab.webview.executeJavaScript('!!document.querySelector(\'input[type="password"]\')');
    if(!has)return;
    const domain=new URL(tab.url).hostname;
    const matches=await B.findPasswords?.(domain)||[];
    if(!matches.length)return;
    showAutoFillBar(tab,matches);
  }catch(_){}
}
function showAutoFillBar(tab,matches){
  document.getElementById("_af")?.remove();
  const bar=document.createElement("div");bar.id="_af";
  bar.style.cssText="width:100%;background:var(--panel);border-bottom:1px solid var(--line-mid);display:flex;align-items:center;gap:10px;padding:7px 14px;font-size:12px;color:var(--text);z-index:9000";
  const m=matches[0];
  const info=document.createElement("span");info.innerHTML=`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="vertical-align:middle;margin-right:4px"><rect x="2" y="5" width="8" height="6" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M4 5V4a2 2 0 0 1 4 0v1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><b>${esc(m.domain)}</b>: ${esc(m.username)}`;
  const fillB=document.createElement("button");fillB.textContent="Otomatik Doldur";fillB.style.cssText="padding:3px 12px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;flex-shrink:0";
  fillB.addEventListener("click",async()=>{
    const full=await B.getPassword?.(m.id);if(!full)return;
    tab.webview.executeJavaScript(`(()=>{const u=document.querySelector('input[type="email"],input[type="text"],input[name*="user"],input[name*="email"],input[id*="user"],input[id*="email"]');const pw=document.querySelector('input[type="password"]');if(u){u.value=${JSON.stringify(full.username)};u.dispatchEvent(new Event('input',{bubbles:true}));}if(pw){pw.value=${JSON.stringify(full.password)};pw.dispatchEvent(new Event('input',{bubbles:true}));}})();`).catch(()=>{});
    bar.remove();
  });
  const clsB=document.createElement("button");clsB.textContent="✕";clsB.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);font-size:14px;padding:0 4px;margin-left:auto";
  clsB.addEventListener("click",()=>bar.remove());bar.append(info,fillB,clsB);
  const chrome=document.querySelector(".chrome-shell");
  if(chrome?.nextSibling)chrome.parentNode.insertBefore(bar,chrome.nextSibling);else document.body.prepend(bar);
  setTimeout(()=>{if(document.body.contains(bar))bar.remove();},8000);
}

// ═══════════════════════════════════════════════════════════════════════════
// ÇEREZ PANELİ
// ═══════════════════════════════════════════════════════════════════════════
let _ckEl=null;
function toggleCookiePanel(){
  closeToolsMenu();
  if(_ckEl){_ckEl.remove();_ckEl=null;return;}
  const p=document.createElement("div");_ckEl=p;
  p.style.cssText="position:fixed;top:0;right:0;width:300px;height:100vh;background:var(--panel);border-left:1px solid var(--line-mid);box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:9992;display:flex;flex-direction:column";
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0";
  hdr.innerHTML='<span style="font-size:13px;font-weight:700;color:var(--text)">Çerez Yöneticisi</span>';
  const cls=document.createElement("button");cls.innerHTML='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;display:flex";cls.addEventListener("click",()=>{p.remove();_ckEl=null;});hdr.appendChild(cls);p.appendChild(hdr);
  const si2=document.createElement("div");si2.style.cssText="padding:8px 12px;border-bottom:1px solid var(--line);flex-shrink:0";
  const sInp=document.createElement("input");sInp.type="text";sInp.placeholder="Domain ara…";
  sInp.style.cssText="width:100%;height:30px;padding:0 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none;box-sizing:border-box";
  si2.appendChild(sInp);p.appendChild(si2);
  const listEl=document.createElement("div");listEl.style.cssText="flex:1;overflow-y:auto;padding:8px";p.appendChild(listEl);
  const footer=document.createElement("div");footer.style.cssText="padding:8px 12px;border-top:1px solid var(--line);flex-shrink:0";
  const ca=document.createElement("button");ca.textContent="Tüm çerezleri sil";ca.style.cssText="width:100%;height:32px;border:1px solid #e07040;background:0;color:#e07040;border-radius:8px;cursor:pointer;font-size:12.5px";
  ca.addEventListener("click",async()=>{if(!confirm("Tüm çerezler silinsin mi?"))return;await B.clearCookies?.();showToast("Çerezler temizlendi");loadC("");});
  footer.appendChild(ca);p.appendChild(footer);document.body.appendChild(p);
  sInp.addEventListener("input",()=>loadC(sInp.value));loadC("");
  async function loadC(filter){
    listEl.innerHTML='<div style="padding:12px;font-size:12px;color:var(--text-2);text-align:center">Yükleniyor…</div>';
    try{
      const cookies=await B.getCookies?.()||[];const lf=(filter||"").toLowerCase();
      const fil=lf?cookies.filter(c=>(c.domain||"").toLowerCase().includes(lf)):cookies;
      const byD={};fil.forEach(c=>{const d=c.domain||"?";(byD[d]=byD[d]||[]).push(c);});const doms=Object.keys(byD).sort();
      if(!doms.length){listEl.innerHTML='<div style="padding:16px;font-size:12px;color:var(--text-2);text-align:center">Çerez yok</div>';return;}
      listEl.innerHTML="";
      doms.forEach(d=>{
        const box=document.createElement("div");box.style.cssText="background:var(--panel-soft);border-radius:8px;padding:8px 10px;margin-bottom:6px";
        const dh=document.createElement("div");dh.style.cssText="display:flex;align-items:center;gap:6px;margin-bottom:4px";
        const dn=document.createElement("span");dn.style.cssText="flex:1;font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";dn.textContent=d;
        const dc=document.createElement("span");dc.style.cssText="font-size:11px;color:var(--text-2);flex-shrink:0";dc.textContent=byD[d].length+" çerez";
        const db2=document.createElement("button");db2.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3h9M4 3V1.5h4V3M9 3l-.6 7H3.6L3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        db2.style.cssText="border:0;background:0;cursor:pointer;color:#e07040;padding:2px;display:flex;border-radius:4px";
        db2.addEventListener("click",async()=>{await B.clearCookiesByDomain?.(d);loadC(filter);});
        dh.append(dn,dc,db2);box.appendChild(dh);
        byD[d].slice(0,3).forEach(c=>{const row=document.createElement("div");row.style.cssText="display:flex;gap:6px;padding:1px 0";const cn=document.createElement("span");cn.style.cssText="font-size:11px;color:var(--accent);font-weight:600;min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";cn.textContent=c.name;const cv=document.createElement("span");cv.style.cssText="font-size:11px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1";cv.textContent=(c.value||"").slice(0,40);row.append(cn,cv);box.appendChild(row);});
        if(byD[d].length>3){const more=document.createElement("div");more.style.cssText="font-size:10px;color:var(--text-2);margin-top:2px";more.textContent=`+${byD[d].length-3} daha…`;box.appendChild(more);}
        listEl.appendChild(box);
      });
    }catch(e){listEl.innerHTML=`<div style="padding:12px;font-size:12px;color:#e07040">Hata: ${esc(e.message)}</div>`;}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SAYFA NOTU
// ═══════════════════════════════════════════════════════════════════════════
let _snEl=null,_snHost="";
async function toggleStickyNote(){
  closeToolsMenu();
  const at=getActiveTab();if(!at?.url||at.type!=="web")return;
  try{_snHost=new URL(at.url).hostname;}catch(_){_snHost="unknown";}
  if(_snEl){_snEl.remove();_snEl=null;return;}
  const p=document.createElement("div");_snEl=p;
  p.style.cssText="position:fixed;bottom:20px;right:20px;width:280px;background:var(--panel);border:1px solid var(--line-mid);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9993;display:flex;flex-direction:column";
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid var(--line)";
  const lbl=document.createElement("span");lbl.style.cssText="font-size:11px;font-weight:700;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px";lbl.textContent="Not: "+_snHost;
  const cls=document.createElement("button");cls.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  cls.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:2px;display:flex";cls.addEventListener("click",()=>{p.remove();_snEl=null;});hdr.append(lbl,cls);p.appendChild(hdr);
  const ta=document.createElement("textarea");ta.placeholder="Bu sayfa için not…";
  ta.style.cssText="height:140px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);font:12.5px/1.7 system-ui,sans-serif;outline:none;resize:none;padding:10px 14px;width:100%;box-sizing:border-box";
  p.appendChild(ta);
  const ftr=document.createElement("div");ftr.style.cssText="padding:8px 14px";
  const sb=document.createElement("button");sb.textContent="Kaydet";sb.style.cssText="padding:4px 14px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600";
  sb.addEventListener("click",async()=>{try{await B.saveStickyNotes?.(_snHost,[{id:"n1",text:ta.value,updatedAt:new Date().toISOString()}]);showToast("Not kaydedildi");}catch(e){showToast("Hata: "+e.message);}});
  ftr.appendChild(sb);p.appendChild(ftr);document.body.appendChild(p);
  try{const ns=await B.getStickyNotes?.(_snHost)||[];ta.value=ns[0]?.text||"";}catch(_){}
}

// ═══════════════════════════════════════════════════════════════════════════
// KULLANICI SCRIPTLERİ (EXECUTE JS)
// ═══════════════════════════════════════════════════════════════════════════
let _scriptEl=null;
function toggleScriptPanel() {
  closeToolsMenu();
  const at=getActiveTab(); if(!at?.webview || at.type !== "web") { showToast("Sadece web sayfalarında çalışır"); return; }
  if(_scriptEl){_scriptEl.remove();_scriptEl=null;return;}
  const p=document.createElement("div");_scriptEl=p;
  p.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:min(400px,90vw);background:var(--panel);border:1px solid var(--line-mid);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:9999;display:flex;flex-direction:column";
  
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid var(--line)";
  const lbl=document.createElement("span");lbl.style.cssText="font-size:12px;font-weight:700;color:var(--text);";lbl.textContent="Özel Script Çalıştır";
  const cls=document.createElement("button");cls.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  cls.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);padding:2px;font-size:12px;display:flex";cls.addEventListener("click",()=>{p.remove();_scriptEl=null;});hdr.append(lbl,cls);p.appendChild(hdr);
  
  const ta=document.createElement("textarea");ta.placeholder="Geçerli sayfada çalıştırılacak JavaScript kodunu yazın...\nÖrn: document.body.style.background = 'red';";
  ta.style.cssText="height:120px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);font:12px/1.6 Consolas,monospace;outline:none;resize:none;padding:10px 14px;width:100%;box-sizing:border-box";
  try{ta.value=sessionStorage.getItem("_ill_last_script")||"";}catch(_){}
  p.appendChild(ta);
  
  const ftr=document.createElement("div");ftr.style.cssText="padding:10px 14px;display:flex;justify-content:space-between;align-items:center";
  const h=document.createElement("div");h.style.cssText="font-size:11px;color:var(--text-2)";h.textContent="Bu sekme için hemen çalışır";
  const sb=document.createElement("button");sb.textContent="Çalıştır ▶";sb.style.cssText="padding:5px 16px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600";
  sb.addEventListener("click",()=>{
    const code=ta.value.trim();if(!code)return;
    try{sessionStorage.setItem("_ill_last_script",code)}catch(_){}
    at.webview.executeJavaScript(code).then(()=>{showToast("Script çalıştırıldı")}).catch((e)=>{showToast("Hata: "+e.message)});
  });
  ftr.append(h,sb);p.appendChild(ftr);document.body.appendChild(p);
  setTimeout(()=>ta.focus(),50);
}

// ═══════════════════════════════════════════════════════════════════════════
// KLAVYE KISAYOLLARI
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener("keydown",e=>{
  const ctrl=e.ctrlKey||e.metaKey;
  if(ctrl&&e.shiftKey&&e.key.toLowerCase()==="s"){e.preventDefault();takeScreenshot();}
  if(ctrl&&!e.shiftKey&&e.key.toLowerCase()==="b"){e.preventDefault();toggleSidePanel();}
},false);

// ═══════════════════════════════════════════════════════════════════════════
// MAIL & TAKVİM PANELİ
// ═══════════════════════════════════════════════════════════════════════════
let _mailPanelEl=null;
const MAIL_SERVICES=[
  {id:"gmail",   label:"Gmail",        icon:"M", url:"https://mail.google.com",          color:"#EA4335"},
  {id:"outlook", label:"Outlook",      icon:"O", url:"https://outlook.live.com",          color:"#0078D4"},
  {id:"yahoo",   label:"Yahoo Mail",   icon:"Y", url:"https://mail.yahoo.com",            color:"#6001D2"},
  {id:"proton",  label:"ProtonMail",   icon:"P", url:"https://mail.proton.me",            color:"#6D4AFF"},
  {id:"yandex",  label:"Yandex Mail",  icon:"Я", url:"https://mail.yandex.com",           color:"#FC3F1D"},
  {id:"icloud",  label:"iCloud Mail",  icon:"☁", url:"https://www.icloud.com/mail",      color:"#2596FF"},
];
const CAL_SERVICES=[
  {id:"gcal",    label:"Google Takvim",icon:"G", url:"https://calendar.google.com",       color:"#1A73E8"},
  {id:"ocal",    label:"Outlook Takvim",icon:"O",url:"https://outlook.live.com/calendar", color:"#0078D4"},
  {id:"notion",  label:"Notion",       icon:"N", url:"https://notion.so",                 color:"#222222"},
  {id:"cal",     label:"Cal.com",      icon:"C", url:"https://cal.com",                   color:"#292929"},
  {id:"apple",   label:"iCloud Takvim",icon:"A", url:"https://www.icloud.com/calendar",  color:"#FF3B30"},
];
function toggleMailPanel(){
  closeToolsMenu();
  if(_mailPanelEl){_mailPanelEl.remove();_mailPanelEl=null;return;}
  const p=document.createElement("div");_mailPanelEl=p;
  p.style.cssText="position:fixed;top:0;right:0;width:288px;height:100vh;background:var(--panel);border-left:1px solid var(--line-mid);box-shadow:-4px 0 24px rgba(0,0,0,.15);z-index:9999;display:flex;flex-direction:column;overflow:hidden";
  const sty=document.createElement("style");sty.id="_mst";
  sty.textContent="@keyframes _ms{from{transform:translateX(100%)}to{transform:none}} #_mpl{animation:_ms 180ms ease} ._mi{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--line-mid);background:var(--panel-soft);margin-bottom:6px;cursor:pointer;transition:background 100ms,border-color 100ms;text-align:left} ._mi:hover{background:var(--panel);border-color:var(--accent)} ._mic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0} ._milbl strong{font-size:13px;font-weight:600;color:var(--text);display:block} ._milbl span{font-size:11px;color:var(--text-2)}";
  document.head.appendChild(sty);p.id="_mpl";
  // Header
  const hdr=document.createElement("div");hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border-bottom:1px solid var(--line-mid);flex-shrink:0";
  hdr.innerHTML='<span style="font-size:13px;font-weight:700;color:var(--text)">📧 Mail & 📅 Takvim</span>';
  const x=document.createElement("button");x.style.cssText="border:0;background:0;cursor:pointer;color:var(--text-2);font-size:17px;padding:0 4px;line-height:1";x.textContent="×";
  x.onclick=()=>{p.remove();_mailPanelEl=null;sty.remove();};hdr.appendChild(x);p.appendChild(hdr);
  // Tabs
  const tb=document.createElement("div");tb.style.cssText="display:flex;border-bottom:1px solid var(--line-mid);flex-shrink:0";
  let activeTab="mail";
  const tbs={};
  [{id:"mail",lbl:"Mail"},{id:"cal",lbl:"Takvim"}].forEach(t=>{
    const b=document.createElement("button");b.style.cssText="flex:1;padding:8px;border:0;background:0;font-size:12px;font-weight:600;cursor:pointer;border-bottom:2px solid "+(t.id===activeTab?"var(--accent)":"transparent")+";color:"+(t.id===activeTab?"var(--accent)":"var(--text-2)")+";transition:color 120ms,border-color 120ms";
    b.textContent=t.lbl;tbs[t.id]=b;
    b.onclick=()=>{activeTab=t.id;Object.entries(tbs).forEach(([k,btn])=>{btn.style.borderBottomColor=k===t.id?"var(--accent)":"transparent";btn.style.color=k===t.id?"var(--accent)":"var(--text-2)";});render();};
    tb.appendChild(b);
  });
  p.appendChild(tb);
  const sc=document.createElement("div");sc.style.cssText="flex:1;overflow-y:auto;padding:10px";p.appendChild(sc);
  function render(){
    sc.innerHTML="";
    const list=activeTab==="mail"?MAIL_SERVICES:CAL_SERVICES;
    list.forEach(svc=>{
      const card=document.createElement("button");card.className="_mi";card.type="button";
      card.innerHTML=`<div class="_mic" style="background:${svc.color}">${svc.icon}</div><div class="_milbl"><strong>${svc.label}</strong><span>${svc.url.replace(/^https?:\/\//,"")}</span></div><span style="margin-left:auto;color:var(--text-2);font-size:13px">→</span>`;
      card.onclick=()=>{openWebTab(svc.url,{activate:true});p.remove();_mailPanelEl=null;sty.remove();};
      sc.appendChild(card);
    });
  }
  render();
  document.body.appendChild(p);
  setTimeout(()=>{document.addEventListener("click",function _c(e){if(!p.contains(e.target)&&!e.target.closest("#tm-mail")){p.remove();_mailPanelEl=null;sty.remove();document.removeEventListener("click",_c);}});},50);
}

// ═══════════════════════════════════════════════════════════════════════════
// ARAÇLAR MENÜSÜ BAĞLAMALARI
// ═══════════════════════════════════════════════════════════════════════════
function _bindToolsMenu(){
  const btn=document.getElementById("tools-menu-btn");
  if(btn)btn.addEventListener("click",toggleToolsMenu);

  const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener("click",fn);};
  bind("tm-command-bar",()=>typeof openCommandBar === 'function' && openCommandBar());
  bind("tm-split",      ()=>typeof toggleSplitView === 'function' && toggleSplitView());
  bind("tm-pip",        ()=>{
    closeToolsMenu();
    const at = getActiveTab();
    if (!at || !at.webview) return;
    at.webview.executeJavaScript('(()=>{const v=document.querySelector("video");if(v&&document.pictureInPictureEnabled){if(document.pictureInPictureElement){document.exitPictureInPicture().catch(()=>{});}else{v.requestPictureInPicture().catch(()=>{});}}})();').catch(()=>showToast("PiP başlatılamadı"));
  });
  bind("tm-mail",       ()=>toggleMailPanel());
  bind("tm-translate",  ()=>{closeToolsMenu();translatePage();});
  bind("tm-screenshot", ()=>{closeToolsMenu();takeScreenshot();});
  bind("tm-sticky",     ()=>{closeToolsMenu();toggleStickyNote();});
  bind("tm-script",     ()=>toggleScriptPanel());
  bind("tm-sidepanel",  ()=>{closeToolsMenu();toggleSidePanel();});
  bind("tm-passwords",  ()=>{closeToolsMenu();togglePwPanel();});
  bind("tm-sessions",   ()=>{closeToolsMenu();toggleSessionPanel();});
  bind("tm-cookies",    ()=>{closeToolsMenu();toggleCookiePanel();});
  bind("tm-theme",      ()=>{closeToolsMenu();toggleThemeEditor();});
}

// ═══════════════════════════════════════════════════════════════════════════
// BAŞLATMA
// ═══════════════════════════════════════════════════════════════════════════
(function init(){
  if(!S.bmFolders) S.bmFolders = [];
  _bindToolsMenu();

  try{
    const orig=navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText=async text=>{await orig(text);B.addClipboard?.(text).catch(()=>{});};
  }catch(_){}

  // bmFolders yükle — bootstrap bittikten sonra
  setTimeout(() => {
    B.listBmFolders?.().then(f=>{if(Array.isArray(f)){S.bmFolders=f;renderBmStrip();}}).catch(()=>{});
    renderBmStrip();
  }, 300);
})();