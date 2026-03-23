"use strict";
// research.js — Araştırma sistemi
// ═══════════════════════════════════════════════════════════════════════════
// ARAŞTIRMA SİSTEMİ — Sayfalardan not biriktir, organize et, export et
// ═══════════════════════════════════════════════════════════════════════════
let _researchEl = null;
const _research = { notes: [], activeId: null };

async function _researchLoad() {
  // Önce bellekte var mı bak
  if (_research.notes.length > 0) return;
  // Store'dan yükle
  try {
    const store = await B.loadStore();
    const d = store._researchData || {};
    _research.notes   = Array.isArray(d.notes)  ? d.notes  : [];
    _research.activeId = d.activeId || null;
  } catch(_) {
    // Fallback: sessionStorage
    try {
      const d = JSON.parse(sessionStorage.getItem("_ill_research") || "{}");
      _research.notes   = Array.isArray(d.notes)  ? d.notes  : [];
      _research.activeId = d.activeId || null;
    } catch(_) {}
  }
}
async function _researchSave() {
  // sessionStorage her zaman yaz (hızlı, anlık)
  try { sessionStorage.setItem("_ill_research", JSON.stringify(_research)); } catch(_) {}
  // store'a da yaz (kalıcı)
  try {
    const store = await B.loadStore();
    await B.saveStore({ ...store, _researchData: { notes: _research.notes, activeId: _research.activeId } });
  } catch(_) {}
}

async function addResearchNote(data) {
  await _researchLoad();
  const at = getActiveTab();
  const url = data?.url || at?.url || "";
  const text = data?.text || "";
  if (!text.trim()) return;
  let host = "";
  try { host = new URL(url).hostname; } catch(_) {}

  // Aktif araştırma oturumu yoksa varsayılan oluştur
  if (!_research.activeId || !_research.notes.find(n => n.id === _research.activeId)) {
    const session = { id: "r" + Date.now(), title: "Araştırma " + new Date().toLocaleDateString("tr-TR"), entries: [], createdAt: new Date().toISOString() };
    _research.notes.push(session);
    _research.activeId = session.id;
  }

  const session = _research.notes.find(n => n.id === _research.activeId);
  if (session) {
    session.entries.push({ id: "e" + Date.now(), text: text.trim(), url, host, title: at?.title || host, savedAt: new Date().toISOString() });
    await _researchSave();
    showToast("Araştırmaya eklendi (" + (text.slice(0, 30)) + "…)");
    // Panel açıksa güncelle
    if (_researchEl) _renderResearchPanel(_researchEl.querySelector("._rp_body"));
  }
}

async function toggleResearchPanel() {
  closeToolsMenu();
  await _researchLoad();
  if (_researchEl) { _researchEl.remove(); _researchEl = null; return; }

  const p = document.createElement("div"); _researchEl = p;
  p.style.cssText = "position:fixed;top:0;right:0;width:340px;height:100vh;background:var(--panel);border-left:1px solid var(--line-mid);box-shadow:-4px 0 24px rgba(0,0,0,.14);z-index:9994;display:flex;flex-direction:column;animation:slideInRight 160ms ease";

  if (!document.getElementById("_rp_anim")) {
    const s = document.createElement("style"); s.id = "_rp_anim";
    s.textContent = "@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}";
    document.head.appendChild(s);
  }

  // Header
  const hdr = document.createElement("div");
  hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);flex-shrink:0;gap:8px";
  const title = document.createElement("span");
  title.style.cssText = "font-size:13px;font-weight:700;color:var(--text)";
  title.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:middle;margin-right:5px"><path d="M2 3h10M2 7h7M2 11h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Araştırma Paneli';
  const cls = document.createElement("button");
  cls.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  cls.style.cssText = "border:0;background:0;cursor:pointer;color:var(--text-2);padding:3px;display:flex";
  cls.addEventListener("click", () => { p.remove(); _researchEl = null; });
  hdr.append(title, cls); p.appendChild(hdr);

  // Oturum seçici + yeni
  const sesBar = document.createElement("div");
  sesBar.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--line);flex-shrink:0";
  const sesSelect = document.createElement("select");
  sesSelect.style.cssText = "flex:1;height:30px;padding:0 8px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none";
  const newSesBtn = document.createElement("button");
  newSesBtn.textContent = "+ Yeni";
  newSesBtn.style.cssText = "padding:0 10px;height:30px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap";

  function populateSesSelect() {
    sesSelect.innerHTML = "";
    if (!_research.notes.length) {
      const o = document.createElement("option"); o.value = ""; o.textContent = "Araştırma oturumu yok"; sesSelect.appendChild(o);
    } else {
      _research.notes.forEach(n => {
        const o = document.createElement("option"); o.value = n.id; o.textContent = n.title + " (" + (n.entries?.length || 0) + ")";
        if (n.id === _research.activeId) o.selected = true;
        sesSelect.appendChild(o);
      });
    }
  }
  populateSesSelect();
  sesSelect.addEventListener("change", () => { _research.activeId = sesSelect.value; void _researchSave(); _renderResearchPanel(body); });
  newSesBtn.addEventListener("click", () => {
    const name = prompt("Araştırma adı:", "Yeni Araştırma " + new Date().toLocaleDateString("tr-TR"));
    if (!name?.trim()) return;
    const session = { id: "r" + Date.now(), title: name.trim(), entries: [], createdAt: new Date().toISOString() };
    _research.notes.push(session); _research.activeId = session.id; _researchSave();
    populateSesSelect(); _renderResearchPanel(body);
  });
  sesBar.append(sesSelect, newSesBtn); p.appendChild(sesBar);

  // Toolbar (arama + export + sil)
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:5px;padding:6px 12px;border-bottom:1px solid var(--line);flex-shrink:0";
  const searchInp = document.createElement("input");
  searchInp.type = "text"; searchInp.placeholder = "Notlarda ara…";
  searchInp.style.cssText = "flex:1;height:28px;padding:0 9px;border:1px solid var(--line-mid);border-radius:7px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none";

  const mkToolBtn = (icon, title, action) => {
    const b = document.createElement("button"); b.title = title;
    b.innerHTML = icon;
    b.style.cssText = "border:0;background:0;cursor:pointer;color:var(--text-2);padding:4px 6px;border-radius:6px;display:flex;align-items:center;font-size:13px";
    b.onmouseover = () => b.style.color = "var(--accent)"; b.onmouseout = () => b.style.color = "var(--text-2)";
    b.addEventListener("click", action); return b;
  };

  const exportBtn = mkToolBtn('<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', "Markdown olarak export et", () => exportResearch());
  const delBtn   = mkToolBtn('<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M10.5 4l-.6 8H4.1l-.6-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>', "Oturumu sil", () => {
    if (!_research.activeId || !confirm("Bu araştırma oturumunu sil?")) return;
    _research.notes = _research.notes.filter(n => n.id !== _research.activeId);
    _research.activeId = _research.notes[0]?.id || null;
    void _researchSave(); populateSesSelect(); _renderResearchPanel(body);
  });

  searchInp.addEventListener("input", () => _renderResearchPanel(body, searchInp.value));
  toolbar.append(searchInp, exportBtn, delBtn); p.appendChild(toolbar);

  const body = document.createElement("div");
  body.className = "_rp_body";
  body.style.cssText = "flex:1;overflow-y:auto;padding:8px 12px";
  p.appendChild(body);

  // AI Copilot Section (Ust)
  const aiSection = document.createElement("div");
  aiSection.style.cssText = "padding:12px;border-bottom:1px solid var(--line);flex-shrink:0;background:var(--accent-soft)";
  const aiHdr = document.createElement("div");
  aiHdr.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:8px";
  aiHdr.innerHTML = '<span style="font-size:12px;font-weight:700;color:var(--accent)">🤖 AI Copilot</span>';
  
  const aiBtn = document.createElement("button");
  aiBtn.textContent = "Sayfayı Özetle ✨";
  aiBtn.style.cssText = "padding:6px 12px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:11.5px;font-weight:600;display:flex;align-items:center;margin:0 auto;width:100%;justify-content:center";
  
  const aiOutput = document.createElement("div");
  aiOutput.style.cssText = "margin-top:10px;font-size:12px;color:var(--text);line-height:1.6;display:none;background:var(--panel);padding:10px;border-radius:8px;border:1px solid var(--line-mid)";
  
  aiBtn.addEventListener("click", () => {
    aiBtn.textContent = "Okunuyor...";
    aiBtn.disabled = true;
    aiOutput.style.display = "block";
    aiOutput.innerHTML = '<span class="tab-spinner" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>İçerik analiz ediliyor...';
    
    const at = getActiveTab();
    if (!at || !at.webview) { aiOutput.innerHTML = "Web sayfası bulunamadı."; aiBtn.textContent = "Tekrar Dene"; aiBtn.disabled = false; return; }
    
    at.webview.executeJavaScript(`(() => {
       const ps = Array.from(document.querySelectorAll('h1, h2, h3, p')).map(e => e.innerText.trim()).filter(t => t.length > 30);
       return ps.slice(0, 15).join('\\n');
    })()`).then(text => {
       if (!text) { aiOutput.innerHTML = "Sayfada okunabilir metin bulunamadı."; aiBtn.textContent = "Sayfayı Özetle ✨"; aiBtn.disabled = false; return; }
       
       // Sentezlenmiş Yerel Özet (Pseudo-AI)
       aiBtn.textContent = "Özetleniyor...";
       setTimeout(() => {
         const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
         const summary = sentences.filter(s => s.length > 50).slice(0, 3).map(s => s.trim()).join(" ");
         
         const finalObj = (summary.length > 30 ? summary : text.slice(0, 200) + "...") + " 🚀";
         
         // Typewriter
         aiOutput.innerHTML = "<b>Özet:</b><br/>";
         let i = 0;
         aiBtn.textContent = "Sayfayı Özetle ✨";
         aiBtn.disabled = false;
         
         const iv = setInterval(() => {
           aiOutput.innerHTML += finalObj.charAt(i);
           i++;
           if (i >= finalObj.length) { clearInterval(iv); addResearchNote({ text: "-- AI Özet --\\n" + finalObj, url: at.url }); }
         }, 15);
       }, 800);
    }).catch(e => {
       aiOutput.innerHTML = "Hata: " + e.message;
       aiBtn.disabled = false; aiBtn.textContent = "Sayfayı Özetle ✨";
    });
  });
  
  aiSection.append(aiHdr, aiBtn, aiOutput); p.appendChild(aiSection);

  // Hızlı not ekle (altta)
  const quickAdd = document.createElement("div");
  quickAdd.style.cssText = "padding:8px 12px;border-top:1px solid var(--line);flex-shrink:0";
  const qInp = document.createElement("textarea");
  qInp.placeholder = "Hızlı not ekle…";
  qInp.style.cssText = "width:100%;height:60px;padding:7px 10px;border:1px solid var(--line-mid);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;outline:none;resize:none;box-sizing:border-box;margin-bottom:5px";
  const qBtn = document.createElement("button"); qBtn.textContent = "Ekle";
  qBtn.style.cssText = "width:100%;height:30px;border:0;background:var(--accent);color:var(--accent-ink,#fff);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600";
  qBtn.addEventListener("click", () => {
    const text = qInp.value.trim();
    if (!text) return;
    addResearchNote({ text, url: getActiveTab()?.url || "" });
    qInp.value = "";
    populateSesSelect();
    _renderResearchPanel(body, searchInp.value);
  });
  quickAdd.append(qInp, qBtn); p.appendChild(quickAdd);
  document.body.appendChild(p);
  _renderResearchPanel(body);
}

function _renderResearchPanel(body, filter = "") {
  if (!body) return;
  body.innerHTML = "";
  const session = _research.notes.find(n => n.id === _research.activeId);
  if (!session) {
    const em = document.createElement("div");
    em.style.cssText = "padding:24px;text-align:center;font-size:12px;color:var(--text-2);line-height:1.7";
    em.innerHTML = "Araştırma oturumu seç veya yeni oluştur.<br>Herhangi bir sayfada metin seçip<br><b>sağ tık → Araştırmaya ekle</b> ile not biriktirebilirsin.";
    body.appendChild(em); return;
  }

  const entries = (session.entries || []).filter(e =>
    !filter || (e.text||"").toLowerCase().includes(filter.toLowerCase()) || (e.title||"").toLowerCase().includes(filter.toLowerCase())
  );

  if (!entries.length) {
    const em = document.createElement("div");
    em.style.cssText = "padding:20px;text-align:center;font-size:12px;color:var(--text-2)";
    em.textContent = filter ? "Sonuç bulunamadı." : "Bu oturumda henüz not yok.";
    body.appendChild(em); return;
  }

  // Kaynağa göre grupla
  const byHost = {};
  entries.forEach(e => { const h = e.host || "Bilinmeyen"; (byHost[h] = byHost[h] || []).push(e); });

  Object.entries(byHost).forEach(([host, hostEntries]) => {
    // Kaynak başlığı
    const hostHdr = document.createElement("div");
    hostHdr.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 0 4px;border-bottom:1px solid var(--line-mid)";
    const fu = hostEntries[0]?.url ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=16` : "";
    hostHdr.innerHTML = `${fu ? `<img src="${fu}" width="12" height="12" style="border-radius:2px;flex-shrink:0" onerror="this.remove()">` : ""}<span style="font-size:11.5px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${host}</span><span style="font-size:10px;color:var(--text-2);flex-shrink:0">${hostEntries.length} not</span>`;
    body.appendChild(hostHdr);

    hostEntries.forEach((entry, idx) => {
      const card = document.createElement("div");
      card.style.cssText = "padding:8px 0;border-bottom:1px solid var(--line-mid);position:relative";

      const textEl = document.createElement("div");
      textEl.style.cssText = "font-size:12.5px;color:var(--text);line-height:1.6;margin-bottom:5px;padding-right:20px";
      const hi = filter ? entry.text.replace(new RegExp(`(${filter})`, "gi"), "<mark style='background:var(--accent-soft);color:var(--accent);border-radius:2px'>$1</mark>") : entry.text;
      textEl.innerHTML = hi;

      const meta = document.createElement("div");
      meta.style.cssText = "display:flex;align-items:center;gap:8px";
      const timeEl = document.createElement("span");
      timeEl.style.cssText = "font-size:10.5px;color:var(--text-2)";
      timeEl.textContent = new Date(entry.savedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
      const linkEl = document.createElement("button");
      linkEl.style.cssText = "padding:0;border:0;background:0;cursor:pointer;font-size:10.5px;color:var(--accent);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px";
      linkEl.textContent = entry.url.replace(/^https?:\/\//, "").slice(0, 40);
      linkEl.title = entry.url;
      linkEl.addEventListener("click", () => entry.url && navigateCurrent(entry.url));
      meta.append(timeEl, linkEl);

      const delE = document.createElement("button");
      delE.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
      delE.style.cssText = "position:absolute;top:8px;right:0;border:0;background:0;cursor:pointer;color:var(--text-2);padding:2px;border-radius:4px;display:flex;opacity:0;transition:opacity 100ms";
      card.onmouseover = () => delE.style.opacity = "1";
      card.onmouseout  = () => delE.style.opacity = "0";
      delE.addEventListener("click", () => {
        const si = (session.entries || []).findIndex(e => e.id === entry.id);
        if (si >= 0) { session.entries.splice(si, 1); void _researchSave(); _renderResearchPanel(body, filter); }
      });

      card.append(textEl, meta, delE);
      body.appendChild(card);
    });
  });
}

function exportResearch() {
  const session = _research.notes.find(n => n.id === _research.activeId);
  if (!session || !session.entries?.length) { showToast("Export edilecek not yok"); return; }

  const byHost = {};
  session.entries.forEach(e => { (byHost[e.host || "Bilinmeyen"] = byHost[e.host || "Bilinmeyen"] || []).push(e); });

  let md = `# ${session.title}\n\n*${new Date(session.createdAt).toLocaleDateString("tr-TR")} tarihinde oluşturuldu*\n\n---\n\n`;
  Object.entries(byHost).forEach(([host, entries]) => {
    md += `## ${host}\n\n`;
    entries.forEach(e => {
      md += `> ${e.text}\n\n`;
      if (e.url) md += `[${e.title || host}](${e.url}) — *${new Date(e.savedAt).toLocaleTimeString("tr-TR")}*\n\n`;
    });
    md += "---\n\n";
  });

  // Tarayıcıda download olarak sun
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = session.title.replace(/[^a-z0-9]/gi, "_") + ".md";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Markdown olarak kaydedildi");
}

